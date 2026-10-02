import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";

const IMAGE =
  "postgres@sha256:54451ecb8ab38c24c3ec123f2fd501303a3a1856a5c66e98cecf2460d5e1e9d7";

export async function readSuppliedTestDatabaseUrl(environment: NodeJS.ProcessEnv) {
  const suppliedDatabaseUrl = environment.APP_BUILDER_TEST_DATABASE_URL;
  if (suppliedDatabaseUrl !== undefined) {
    if (environment.APP_BUILDER_TEST_DISPOSABLE_DATABASE !== "1") {
      throw new Error(
        "APP_BUILDER_TEST_DISPOSABLE_DATABASE=1 is required for a supplied database.",
      );
    }
    const parsed = new URL(suppliedDatabaseUrl);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
      throw new Error("APP_BUILDER_TEST_DATABASE_URL must be a PostgreSQL URL.");
    }
    for (const key of parsed.searchParams.keys()) {
      if (["host", "hostaddr"].includes(key.toLowerCase())) {
        throw new Error("PostgreSQL host override parameters are not allowed.");
      }
    }
    if (decodeURIComponent(parsed.hostname).includes("/")) {
      throw new Error("PostgreSQL Unix socket hosts are not allowed.");
    }
    const addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => !isLoopback(address))
    ) {
      throw new Error(
        "APP_BUILDER_TEST_DATABASE_URL must identify a disposable loopback database.",
      );
    }
  }
  return suppliedDatabaseUrl;
}

async function main() {
  const [command, ...arguments_] = process.argv.slice(2);
  if (!command) throw new Error("Provide a command to run with the test database.");
  const suppliedDatabaseUrl = await readSuppliedTestDatabaseUrl(process.env);
  const containerName = `app-builder-postgres-${process.pid}`;
  let startedContainer = false;
  try {
    const databaseUrl = suppliedDatabaseUrl ?? (await startContainer(containerName));
    startedContainer = suppliedDatabaseUrl === undefined;
    const exitCode = await run(command, arguments_, {
      DATABASE_URL: databaseUrl,
      APP_BUILDER_TEST_DATABASE_URL: databaseUrl,
      APP_BUILDER_TEST_DISPOSABLE_DATABASE: "1",
    });
    if (exitCode !== 0) process.exitCode = exitCode;
  } finally {
    if (startedContainer) {
      const stopped = await run("docker", ["stop", "--timeout", "5", containerName]);
      if (stopped !== 0) {
        process.stderr.write("Could not stop disposable PostgreSQL\n");
        process.exitCode ??= 1;
      }
    }
  }
}

function isLoopback(address: string): boolean {
  if (isIP(address) === 4) return address.startsWith("127.");
  return address === "::1" || address.toLowerCase().startsWith("::ffff:127.");
}

async function startContainer(containerName: string): Promise<string> {
  const exitCode = await run("docker", [
    "run",
    "--rm",
    "--detach",
    "--name",
    containerName,
    "--publish",
    "127.0.0.1::5432",
    "--tmpfs",
    "/var/lib/postgresql",
    "--env",
    "POSTGRES_DB=generated_app",
    "--env",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    IMAGE,
  ]);
  if (exitCode !== 0) throw new Error("Could not start disposable PostgreSQL");
  try {
    const output = await capture("docker", ["port", containerName, "5432/tcp"]);
    const port = output.trim().match(/:(\d+)$/)?.[1];
    if (port === undefined) {
      throw new Error(`Could not resolve the PostgreSQL port: ${output}`);
    }
    return `postgresql://postgres@127.0.0.1:${port}/generated_app`;
  } catch (error) {
    await run("docker", ["stop", "--timeout", "5", containerName]);
    throw error;
  }
}

function run(
  command: string,
  arguments_: string[],
  environment: Record<string, string> = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      env: { ...process.env, ...environment },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

function capture(command: string, arguments_: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      stdio: ["ignore", "pipe", "inherit"],
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} exited with ${String(code)}`));
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Test command failed"}\n`,
    );
    process.exitCode = 1;
  });
}
