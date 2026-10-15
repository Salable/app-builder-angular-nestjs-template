import { Component, inject, signal } from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { ApiClient, failureMessage } from "./api-client";
import { SessionService } from "./session.service";

@Component({
  selector: "app-auth-page",
  imports: [RouterLink],
  template: `
    <section class="card auth-card">
      <p class="eyebrow">Account access</p>
      <h1>{{ mode === "sign-up" ? "Create your account" : "Sign in" }}</h1>
      <p>
        {{
          mode === "sign-up"
            ? "Use this form to create an account."
            : "Use this form to access the application."
        }}
      </p>
      <form #form (submit)="$event.preventDefault(); submit(form)">
        @if (mode === "sign-up") {
          <label>Name<input name="name" autocomplete="name" required /></label>
        }
        <label
          >Email<input name="email" type="email" autocomplete="email" required
        /></label>
        <label
          >Password<input
            name="password"
            type="password"
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
            busy()
              ? "Please wait…"
              : mode === "sign-up"
                ? "Create your account"
                : "Sign in"
          }}
        </button>
      </form>
      <p>
        {{ mode === "sign-up" ? "Already have an account?" : "Need an account?" }}
        <a [routerLink]="mode === 'sign-up' ? '/sign-in' : '/sign-up'">{{
          mode === "sign-up" ? "Sign in" : "Create an account"
        }}</a>
      </p>
      <a routerLink="/">Return home</a>
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
  async submit(form: HTMLFormElement) {
    if (this.busy()) return;
    const fields = new FormData(form);
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.authenticate(
        this.mode,
        String(fields.get("email") ?? ""),
        String(fields.get("password") ?? ""),
        String(fields.get("name") ?? ""),
      );
      await this.session.refresh();
      await this.router.navigateByUrl("/workspace");
    } catch (error) {
      this.error.set(failureMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
