import { z } from "zod";

export const ProblemDetailSchema = z
  .object({
    type: z.literal("about:blank"),
    title: z.string(),
    status: z.number().int(),
    detail: z.string(),
    code: z.string(),
    instance: z.string(),
    correlationId: z.string(),
  })
  .strict();
export type ProblemDetail = z.infer<typeof ProblemDetailSchema>;
export const UserSchema = z
  .object({ userId: z.string(), displayName: z.string(), email: z.email() })
  .strict();
export const SessionViewSchema = z.object({ user: UserSchema.nullable() }).strict();
export type User = z.infer<typeof UserSchema>;
