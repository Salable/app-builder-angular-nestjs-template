import { provideBrowserGlobalErrorListeners } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { AppComponent, HomeComponent } from "./app.component";
import { AuthPageComponent } from "./auth-page.component";
import { WorkspaceComponent } from "./workspace.component";

bootstrapApplication(AppComponent, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter([
      { path: "", component: HomeComponent },
      { path: "sign-in", component: AuthPageComponent, data: { mode: "sign-in" } },
      { path: "sign-up", component: AuthPageComponent, data: { mode: "sign-up" } },
      { path: "workspace", component: WorkspaceComponent },
      { path: "**", redirectTo: "" },
    ]),
  ],
}).catch(() => {
  const root = document.querySelector("app-root");
  if (root)
    root.textContent =
      "We couldn't open the application. Reload the page to try again.";
});
