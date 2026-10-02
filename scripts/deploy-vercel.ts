import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deploymentApplicationOrigin, deploymentScripts } from "./deployment-plan";

type RunDeploymentStep = (
  script: string,
  environment: NodeJS.ProcessEnv,
) => { error?: Error; status: number | null };

export function runVercelDeployment(
  environment: NodeJS.ProcessEnv = process.env,
  runStep: RunDeploymentStep = (script, env) =>
    spawnSync("npm", ["run", script], { env, stdio: "inherit" }),
): number {
  const stage = environment.APP_BUILDER_DELIVERY_STAGE;
  const scripts = deploymentScripts(stage);
  deploymentApplicationOrigin(stage, environment);

  for (const script of scripts) {
    const result = runStep(script, environment);
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) {
      console.error(`Vercel deployment step failed: npm run ${script}`);
      return result.status ?? 1;
    }
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runVercelDeployment();
}
