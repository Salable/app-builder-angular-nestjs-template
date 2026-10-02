import { z } from "zod";
import type { SchemaObject } from "@nestjs/swagger";
import {
  UserSchema,
  CreateNoteSchema,
  UpdateNoteSchema,
  NoteSchema,
  NotesViewSchema,
  ProblemDetailSchema,
  SessionViewSchema,
} from "../contracts/api";

const schemas = {
  UserDto: UserSchema,
  CreateNoteDto: CreateNoteSchema,
  UpdateNoteDto: UpdateNoteSchema,
  NoteDto: NoteSchema,
  NotesDto: NotesViewSchema,
  ProblemDetail: ProblemDetailSchema,
  SessionDto: SessionViewSchema,
};

export function schemaRef(name: keyof typeof schemas) {
  return { $ref: `#/components/schemas/${name}` };
}

export function openApiSchemas(): Record<string, SchemaObject> {
  return Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      z.toJSONSchema(schema, { target: "openapi-3.0" }) as SchemaObject,
    ]),
  );
}
