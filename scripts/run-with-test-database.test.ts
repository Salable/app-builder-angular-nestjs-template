import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readSuppliedTestDatabaseUrl } from "./run-with-test-database";

const databaseUrl = "postgresql://postgres@127.0.0.1:5432/generated_app";

describe("shared disposable test database runner", () => {
  it("accepts the same explicit local fixture for integration and browser tests", async () => {
    await expect(readSuppliedTestDatabaseUrl({})).resolves.toBeUndefined();
    await expect(
      readSuppliedTestDatabaseUrl({
        APP_BUILDER_TEST_DATABASE_URL: databaseUrl,
        APP_BUILDER_TEST_DISPOSABLE_DATABASE: "1",
      }),
    ).resolves.toBe(databaseUrl);
    await expect(
      readSuppliedTestDatabaseUrl({
        APP_BUILDER_TEST_DATABASE_URL: "postgresql://postgres@localhost:5432/test",
        APP_BUILDER_TEST_DISPOSABLE_DATABASE: "1",
      }),
    ).resolves.toContain("localhost");
  });

  it.each([
    [databaseUrl, "", "APP_BUILDER_TEST_DISPOSABLE_DATABASE=1"],
    ["https://127.0.0.1/test", "1", "PostgreSQL URL"],
    [`${databaseUrl}?host=remote.example.test`, "1", "host override"],
    ["postgresql://postgres@%2Ftmp/test", "1", "Unix socket"],
    ["postgresql://postgres@192.0.2.1/test", "1", "loopback database"],
  ])("rejects an unsafe fixture %s", async (url, disposable, error) => {
    await expect(
      readSuppliedTestDatabaseUrl({
        APP_BUILDER_TEST_DATABASE_URL: url,
        APP_BUILDER_TEST_DISPOSABLE_DATABASE: disposable,
      }),
    ).rejects.toThrow(error);
  });

  it("runs a child with the validated supplied database without starting Docker", async () => {
    const fixture = await createFixture();
    try {
      const result = run(fixture, "", { APP_BUILDER_TEST_DATABASE_URL: databaseUrl });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ databaseUrl, disposable: "1" });
      expect(await calls(fixture)).toEqual([]);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it.each([
    ["success", 0],
    ["child-failure", 17],
    ["signal", 1],
    ["start-failure", 1],
    ["port-failure", 1],
    ["invalid-port", 1],
    ["stop-failure", 1],
    ["missing-command", 1],
    ["missing-executable", 1],
  ])(
    "propagates %s and cleans up only its own container",
    async (outcome, exitCode) => {
      const fixture = await createFixture();
      try {
        const result = run(fixture, outcome);
        const commands = await calls(fixture);
        expect(result.status).toBe(exitCode);
        if (outcome === "missing-command") {
          expect(commands).toEqual([]);
          expect(result.stderr).toContain("Provide a command");
          return;
        }
        expect(commands[0]?.[0]).toBe("run");
        if (outcome === "start-failure") {
          expect(commands).toHaveLength(1);
          expect(result.stderr).toContain("Could not start disposable");
          return;
        }
        expect(commands[1]?.[0]).toBe("port");
        expect(commands[2]).toEqual([
          "stop",
          "--timeout",
          "5",
          commands[0]![commands[0]!.indexOf("--name") + 1],
        ]);
        if (outcome === "success")
          expect(JSON.parse(result.stdout)).toEqual({ databaseUrl, disposable: "1" });
        if (outcome === "stop-failure")
          expect(result.stderr).toContain("Could not stop disposable");
        if (outcome === "missing-executable") expect(result.stderr).toContain("ENOENT");
      } finally {
        await rm(fixture, { recursive: true, force: true });
      }
    },
  );
});

async function createFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "starter-test-db-"));
  await writeFile(
    path.join(directory, "docker"),
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TEST_DOCKER_LOG, JSON.stringify(args) + "\\n");
const failure = process.env.TEST_DOCKER_OUTCOME;
if (failure === "start-failure" && args[0] === "run") process.exit(1);
if (failure === "port-failure" && args[0] === "port") process.exit(2);
if (failure === "stop-failure" && args[0] === "stop") process.exit(3);
if (args[0] === "port") process.stdout.write(failure === "invalid-port" ? "invalid" : "127.0.0.1:5432");
`,
    { mode: 0o700 },
  );
  return directory;
}

async function calls(directory: string): Promise<string[][]> {
  const log = await readFile(path.join(directory, "calls.jsonl"), "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    },
  );
  return log.trim()
    ? log
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as string[])
    : [];
}

function run(directory: string, outcome: string, environment: NodeJS.ProcessEnv = {}) {
  let command = [
    process.execPath,
    "-e",
    "process.stdout.write(JSON.stringify({databaseUrl:process.env.DATABASE_URL,disposable:process.env.APP_BUILDER_TEST_DISPOSABLE_DATABASE}))",
  ];
  if (outcome === "child-failure")
    command = [process.execPath, "-e", "process.exit(17)"];
  if (outcome === "signal")
    command = [process.execPath, "-e", "process.kill(process.pid, 'SIGTERM')"];
  if (outcome === "missing-executable")
    command = [path.join(directory, "missing-executable")];
  if (outcome === "missing-command") command = [];
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/run-with-test-database.ts", ...command],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        APP_BUILDER_TEST_DATABASE_URL: undefined,
        APP_BUILDER_TEST_DISPOSABLE_DATABASE: "1",
        ...environment,
        PATH: `${directory}${path.delimiter}${process.env.PATH}`,
        TEST_DOCKER_LOG: path.join(directory, "calls.jsonl"),
        TEST_DOCKER_OUTCOME: outcome,
      },
    },
  );
}
