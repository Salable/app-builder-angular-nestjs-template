import { ErrorHandler, provideBrowserGlobalErrorListeners } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { AppComponent, HomeComponent } from "./app.component";
import { AuthPageComponent } from "./auth-page.component";
import { WorkspaceComponent } from "./workspace.component";
import {
  ApplicationErrorHandler,
  reportBootstrapFailure,
} from "./application-error-handler";

bootstrapApplication(AppComponent, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: ApplicationErrorHandler },
    provideRouter([
      { path: "", component: HomeComponent },
      { path: "sign-in", component: AuthPageComponent, data: { mode: "sign-in" } },
      { path: "sign-up", component: AuthPageComponent, data: { mode: "sign-up" } },
      { path: "workspace", component: WorkspaceComponent },
      { path: "**", redirectTo: "" },
    ]),
  ],
}).catch((error: unknown) => reportBootstrapFailure(error, document));
