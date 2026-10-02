import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { ApiClient, ApiFailure, failureMessage } from "./api-client";
import { SessionService } from "./session.service";
import type { Note } from "../contracts/api";

@Component({
  selector: "app-workspace",
  imports: [FormsModule],
  template: `
    <section class="workspace">
      <div class="workspace-heading">
        <div>
          <p class="eyebrow">A space of your own</p>
          <h1>{{ session.user()?.displayName }}'s workspace</h1>
        </div>
        <button class="quiet" (click)="signOut()">Sign out</button>
      </div>
      @if (error(); as failure) {
        <div role="alert" class="error">
          {{ failure.message }}
          @if (failure.retryLoad) {
            <button class="quiet" (click)="load()">Retry loading</button>
          }
        </div>
      }
      @if (loading()) {
        <p role="status">Loading your workspace…</p>
      } @else {
        <section class="card">
          <h2>Keep a thought</h2>
          <p>Only you can see your notes.</p>
          <form (ngSubmit)="save()">
            <label
              >Your note<textarea
                name="content"
                [(ngModel)]="content"
                [disabled]="saving()"
                maxlength="2000"
                required
              ></textarea></label
            ><button [disabled]="saving()">
              {{ saving() ? "Saving…" : "Save note" }}
            </button>
          </form>
        </section>
        <ul class="notes">
          @for (note of notes(); track note.noteId) {
            <li class="card">
              <p>{{ note.content }}</p>
              <button class="quiet" [disabled]="saving()" (click)="edit(note)">
                Edit note</button
              ><button
                class="quiet"
                [disabled]="saving() || removing() !== null"
                (click)="remove(note.noteId)"
              >
                Delete note
              </button>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class WorkspaceComponent {
  readonly session = inject(SessionService);
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  readonly notes = signal<Note[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly removing = signal<string | null>(null);
  readonly error = signal<{ message: string; retryLoad: boolean } | null>(null);
  readonly editingNoteId = signal<string | null>(null);
  content = "";

  constructor() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const user = await this.session.refresh();
      if (!user) {
        await this.router.navigateByUrl("/sign-in");
        return;
      }
      this.notes.set((await this.api.notes()).notes);
    } catch (error) {
      await this.showFailure(error, true);
    } finally {
      this.loading.set(false);
    }
  }

  async save() {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    const submitted = this.content;
    try {
      const noteId = this.editingNoteId();
      const note = noteId
        ? await this.api.updateNote(noteId, submitted)
        : await this.api.createNote(submitted);
      this.notes.update((notes) => {
        if (noteId)
          return notes.map((existing) =>
            existing.noteId === noteId ? note : existing,
          );
        return [note, ...notes];
      });
      this.editingNoteId.set(null);
      this.content = "";
    } catch (error) {
      await this.showFailure(error);
    } finally {
      this.saving.set(false);
    }
  }

  edit(note: Note) {
    if (this.saving()) return;
    this.error.set(null);
    this.content = note.content;
    this.editingNoteId.set(note.noteId);
  }

  async remove(noteId: string) {
    if (this.removing() || this.saving()) return;
    this.removing.set(noteId);
    this.error.set(null);
    try {
      await this.api.removeNote(noteId);
      this.notes.update((notes) => notes.filter((note) => note.noteId !== noteId));
      if (this.editingNoteId() === noteId) {
        this.editingNoteId.set(null);
        this.content = "";
      }
    } catch (error) {
      await this.showFailure(error);
    } finally {
      this.removing.set(null);
    }
  }

  async signOut() {
    try {
      await this.session.signOut();
      await this.router.navigateByUrl("/sign-in");
    } catch (error) {
      await this.showFailure(error);
    }
  }

  private async showFailure(error: unknown, retryLoad = false) {
    if (error instanceof ApiFailure && error.code === "SIGN_IN_REQUIRED") {
      await this.router.navigateByUrl("/sign-in");
      return;
    }
    this.error.set({ message: failureMessage(error), retryLoad });
  }
}
