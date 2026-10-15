import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";

@Component({
  selector: "app-root",
  imports: [RouterLink, RouterOutlet],
  template: `<header>
      <a class="brand" routerLink="/">App Builder starter</a
      ><a routerLink="/workspace">Application</a>
    </header>
    <main><router-outlet /></main>
    <footer>Starter content — replaced by your App Builder tasks.</footer>`,
})
export class AppComponent {}

@Component({
  selector: "app-home",
  imports: [RouterLink],
  template: `<section class="hero">
    <p class="eyebrow">Public view</p>
    <h1>Landing page</h1>
    <p class="intro">
      This is the public entry point for your application. App Builder will replace this
      page with your product's content and design.
    </p>
    <div class="actions">
      <a class="button" routerLink="/sign-up">Create an account</a
      ><a routerLink="/sign-in">Sign in</a>
    </div>
  </section>`,
})
export class HomeComponent {}
