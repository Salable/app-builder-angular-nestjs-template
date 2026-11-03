import { z } from "zod";
import { DiagnosticError } from "../runtime/error-logger";

export const AuthenticatedIdentitySchema = z
  .object({
    email: z.email(),
    name: z.string().min(1),
    sessionId: z.string().min(1),
    userId: z.string().min(1),
  })
  .strict();

export type AuthenticatedIdentity = z.infer<typeof AuthenticatedIdentitySchema>;

export interface IdentityProvider {
  authenticate(headers: Headers): Promise<AuthenticatedIdentity | null>;
}

export class IdentityConfigurationError extends DiagnosticError {
  constructor(message = "Generated application identity is not configured.") {
    super({ category: "configuration", operation: "identity.configure" });
    this.message = message;
    this.name = "IdentityConfigurationError";
  }
}

export class IdentityProviderUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("The identity provider could not complete the request.", options);
    this.name = "IdentityProviderUnavailableError";
  }
}
