import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";

type User = { id: string; email: string; name: string; password: string };

/** Local protocol fixture; this is not a substitute for observing hosted Neon. */
export async function startNeonAuthTestService() {
  const users = new Map<string, User>();
  const sessions = new Map<string, User>();
  const receivedCookies: string[] = [];
  let available = true;
  const server = createServer((request, response) => {
    void handle(request, response).catch(() => {
      response.writeHead(500);
      response.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://localhost:${address.port}`;

  async function handle(request: IncomingMessage, response: ServerResponse) {
    if (!available) return reply(response, { message: "private provider outage" }, 503);
    const url = new URL(request.url!, origin);
    const cookie = request.headers.cookie ?? "";
    receivedCookies.push(cookie);
    const token = cookie
      .split("; ")
      .find((entry) => entry.startsWith("__Secure-neon-auth.session_token="))
      ?.split("=")[1];
    if (url.pathname === "/auth/get-session") {
      const user = token ? sessions.get(token) : undefined;
      return reply(response, user ? session(user, token!) : null);
    }
    if (url.pathname === "/auth/sign-out") {
      if (token) sessions.delete(token);
      return reply(
        response,
        { success: true },
        200,
        "__Secure-neon-auth.session_token=; Domain=localhost; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      );
    }
    if (!["/auth/sign-up/email", "/auth/sign-in/email"].includes(url.pathname)) {
      return reply(response, { message: "Unknown fixture route." }, 404);
    }
    return createSession(request, response, url.pathname === "/auth/sign-up/email");
  }

  async function createSession(
    request: IncomingMessage,
    response: ServerResponse,
    signingUp: boolean,
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as {
      email: string;
      name?: string;
      password: string;
    };
    let user = users.get(body.email);
    if (signingUp) {
      if (user) return reply(response, { message: "Account already exists." }, 400);
      user = {
        id: randomUUID(),
        email: body.email,
        name: body.name!,
        password: body.password,
      };
      users.set(body.email, user);
    }
    if (!user || user.password !== body.password)
      return reply(response, { message: "Invalid email or password." }, 401);
    const nextToken = randomUUID();
    sessions.set(nextToken, user);
    return reply(
      response,
      { token: nextToken, user: session(user, nextToken).user },
      200,
      `__Secure-neon-auth.session_token=${nextToken}; Domain=localhost; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`,
    );
  }

  return {
    origin,
    receivedCookies,
    setAvailable(value: boolean) {
      available = value;
    },
    revokeSessions(email: string) {
      for (const [token, user] of sessions) {
        if (user.email === email) sessions.delete(token);
      }
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function session(user: User, token: string) {
  const now = new Date().toISOString();
  return {
    session: {
      id: token,
      token,
      userId: user.id,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function reply(response: ServerResponse, body: unknown, status = 200, cookie?: string) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Encoding": "gzip",
    "Cache-Control": "public, max-age=3600",
    ...(cookie ? { "Set-Cookie": cookie } : {}),
  });
  response.end(gzipSync(JSON.stringify(body)));
}
