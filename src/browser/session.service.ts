import { inject, Injectable, signal } from "@angular/core";
import { ApiClient } from "./api-client";
import type { User } from "../contracts/api";

@Injectable({ providedIn: "root" })
export class SessionService {
  private readonly api = inject(ApiClient);
  readonly user = signal<User | null>(null);

  async refresh() {
    const view = await this.api.session();
    this.user.set(view.user);
    return view.user;
  }

  async signOut() {
    await this.api.signOut();
    this.user.set(null);
  }
}
