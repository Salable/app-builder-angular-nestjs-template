import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { ApiClient, failureMessage } from "./api-client";
import { SessionService } from "./session.service";

@Component({
  selector: "app-auth-page",
  imports: [FormsModule, RouterLink],
  template: `
    <section class="card auth-card">
      <p class="eyebrow">Your private workspace</p>
      <h1>{{ mode === "sign-up" ? "Make yourself at home." : "Welcome back." }}</h1>
      <p>
        {{
          mode === "sign-up"
            ? "Create an account to begin."
            : "Sign in to pick up where you left off."
        }}
      </p>
      <form (ngSubmit)="submit()">
        @if (mode === "sign-up") {
          <label
            >Name<input name="name" [(ngModel)]="name" autocomplete="name" required
          /></label>
        }
        <label
          >Email<input
            name="email"
            type="email"
            [(ngModel)]="email"
            autocomplete="email"
            required
        /></label>
        <label
          >Password<input
            name="password"
            type="password"
            [(ngModel)]="password"
            [attr.autocomplete]="
              mode === 'sign-up' ? 'new-password' : 'current-password'
            "
            minlength="8"
            required
        /></label>
        @if (error()) {
          <p role="alert" class="error">{{ error() }}</p>
        }
        <button [disabled]="busy()">
          {{
            busy() ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"
          }}
        </button>
      </form>
      <a [routerLink]="mode === 'sign-up' ? '/sign-in' : '/sign-up'">{{
        mode === "sign-up" ? "Already have an account? Sign in" : "Create an account"
      }}</a>
    </section>
  `,
})
export class AuthPageComponent {
  private readonly api = inject(ApiClient);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly mode = inject(ActivatedRoute).snapshot.data["mode"] as "sign-in" | "sign-up";
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  name = "";
  email = "";
  password = "";

  async submit() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.authenticate(this.mode, this.email, this.password, this.name);
      await this.session.refresh();
      await this.router.navigateByUrl("/workspace");
    } catch (error) {
      this.error.set(failureMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
