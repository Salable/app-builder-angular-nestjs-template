import {
  AuthenticatedIdentitySchema,
  type IdentityProvider,
} from "./identity-provider";

type SessionReader = {
  api: {
    getSession(input: {
      headers: Headers;
      query: { disableCookieCache: boolean };
    }): Promise<{
      session: { id: string };
      user: { email: string; id: string; name: string };
    } | null>;
  };
};

export class BetterAuthIdentityProvider implements IdentityProvider {
  constructor(private readonly getAuth: () => SessionReader) {}

  async authenticate(headers: Headers) {
    const result = await this.getAuth().api.getSession({
      headers,
      query: { disableCookieCache: true },
    });
    if (result === null) return null;

    return AuthenticatedIdentitySchema.parse({
      email: result.user.email,
      name: result.user.name,
      sessionId: result.session.id,
      userId: result.user.id,
    });
  }
}
