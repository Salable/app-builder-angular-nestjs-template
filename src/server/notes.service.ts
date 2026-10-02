import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { CreateNoteSchema, UpdateNoteSchema, NoteSchema } from "../contracts/api";
import { PostgresDatabase } from "../persistence/database";
import { ApiProblem } from "./problem-detail";

type NoteRow = { note_id: string; content: string; created_at: Date; updated_at: Date };

@Injectable()
export class NotesService {
  private database: PostgresDatabase | undefined;

  async list(ownerUserId: string) {
    const result = await this.db().query<NoteRow>(
      "SELECT note_id, content, created_at, updated_at FROM notes WHERE owner_user_id = $1 ORDER BY created_at DESC, note_id",
      [ownerUserId],
    );
    return { notes: result.rows.map(noteView) };
  }

  async create(ownerUserId: string, input: unknown) {
    const note = CreateNoteSchema.parse(input);
    const result = await this.db().query<NoteRow>(
      "INSERT INTO notes (note_id, owner_user_id, content) VALUES ($1, $2, $3) RETURNING note_id, content, created_at, updated_at",
      [randomUUID(), ownerUserId, note.content],
    );
    return noteView(result.rows[0]!);
  }

  async read(ownerUserId: string, noteId: string) {
    z.uuid().parse(noteId);
    const result = await this.db().query<NoteRow>(
      "SELECT note_id, content, created_at, updated_at FROM notes WHERE note_id = $1 AND owner_user_id = $2",
      [noteId, ownerUserId],
    );
    if (!result.rows[0])
      throw new ApiProblem(404, "NOTE_NOT_FOUND", "This note could not be found.");
    return noteView(result.rows[0]);
  }

  async update(ownerUserId: string, noteId: string, input: unknown) {
    z.uuid().parse(noteId);
    const note = UpdateNoteSchema.parse(input);
    const result = await this.db().query<NoteRow>(
      "UPDATE notes SET content = $3, updated_at = transaction_timestamp() WHERE note_id = $1 AND owner_user_id = $2 RETURNING note_id, content, created_at, updated_at",
      [noteId, ownerUserId, note.content],
    );
    if (!result.rows[0])
      throw new ApiProblem(404, "NOTE_NOT_FOUND", "This note could not be found.");
    return noteView(result.rows[0]);
  }

  async remove(ownerUserId: string, noteId: string): Promise<void> {
    z.uuid().parse(noteId);
    const result = await this.db().query(
      "DELETE FROM notes WHERE note_id = $1 AND owner_user_id = $2",
      [noteId, ownerUserId],
    );
    if (result.rowCount === 0)
      throw new ApiProblem(404, "NOTE_NOT_FOUND", "This note could not be found.");
  }

  async onModuleDestroy() {
    await this.database?.close();
  }

  private db() {
    if (this.database) return this.database;
    const url = process.env.DATABASE_URL?.trim();
    if (!url)
      throw new ApiProblem(
        503,
        "DATABASE_NOT_CONFIGURED",
        "Application storage is not configured.",
      );
    return (this.database = new PostgresDatabase(url));
  }
}

function noteView(row: NoteRow) {
  return NoteSchema.parse({
    noteId: row.note_id,
    content: row.content,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}
