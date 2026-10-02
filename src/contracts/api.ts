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
export const CreateNoteSchema = z
  .object({ content: z.string().trim().min(1).max(2000) })
  .strict();
export const UpdateNoteSchema = CreateNoteSchema;
export const NoteSchema = z
  .object({
    noteId: z.uuid(),
    content: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const NotesViewSchema = z.object({ notes: z.array(NoteSchema) }).strict();
export type Note = z.infer<typeof NoteSchema>;
export type CreateNoteDto = z.infer<typeof CreateNoteSchema>;
export type UpdateNoteDto = z.infer<typeof UpdateNoteSchema>;
