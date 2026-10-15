import { Component, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { failureMessage } from "./api-client";
import { SessionService } from "./session.service";

@Component({
  selector: "app-workspace",
  imports: [RouterLink],
  template: `
    <section class="workspace">
      <p class="eyebrow">Signed-in view</p>
      <h1>Application</h1>
      @if (error(); as failure) {
        <div role="alert" class="error">
          {{ failure.message }}
          @if (failure.retryLoad) {
            <button class="quiet" (click)="load()">Retry loading</button>
          }
        </div>
      }
      @if (loading()) {
        <p role="status">Loading your session…</p>
      } @else if (!error()?.retryLoad) {
        <section class="card">
          @if (session.user(); as user) {
            <p>
              This is the signed-in area of your application. App Builder will replace
              this shell with the features defined in your project.
            </p>
            <p>Signed in as {{ user.displayName }} ({{ user.email }}).</p>
            <button [disabled]="signingOut()" (click)="signOut()">
              {{ signingOut() ? "Signing out…" : "Sign out" }}
            </button>
          } @else {
            <h2>Sign in required</h2>
            <p>Sign in to open the application.</p>
            <a routerLink="/sign-in">Sign in</a>
          }
        </section>
      }
    </section>
  `,
})
export class WorkspaceComponent {
  readonly session = inject(SessionService);
  readonly loading = signal(true);
  readonly signingOut = signal(false);
  readonly error = signal<{ message: string; retryLoad: boolean } | null>(null);

  constructor() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.session.refresh();
    } catch (error) {
      this.error.set({ message: failureMessage(error), retryLoad: true });
    } finally {
      this.loading.set(false);
    }
  }

  async signOut() {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.error.set(null);
    try {
      await this.session.signOut();
    } catch (error) {
      this.error.set({ message: failureMessage(error), retryLoad: false });
    } finally {
      this.signingOut.set(false);
    }
  }
}
