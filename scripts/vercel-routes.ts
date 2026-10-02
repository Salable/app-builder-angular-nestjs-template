import { resolveApplicationOrigin } from "../src/runtime/application-origin";

export function vercelRoutes(environment: NodeJS.ProcessEnv) {
  const application = [
    { src: "/api(?:/.*)?$", dest: "/api" },
    { handle: "filesystem" },
    { src: "/.*", dest: "/index.html" },
  ];
  if (environment.VERCEL !== "1") return application;
  const origin = resolveApplicationOrigin(environment);
  return [
    {
      src: "/(.*)",
      methods: ["GET", "HEAD"],
      missing: [{ type: "host", value: { eq: new URL(origin).host } }],
      has: [{ type: "header", key: "accept", value: ".*text/html.*" }],
      status: 307,
      headers: { Location: `${origin}/$1`, "Cache-Control": "private, no-store" },
    },
    ...application,
  ];
}
