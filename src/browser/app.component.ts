import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";

@Component({
  selector: "app-root",
  imports: [RouterLink, RouterOutlet],
  template: `<header>
      <a class="brand" routerLink="/">Your space.</a
      ><a routerLink="/workspace">Open workspace</a>
    </header>
    <main><router-outlet /></main>
    <footer>Built for what comes next.</footer>`,
})
export class AppComponent {}

@Component({
  selector: "app-home",
  imports: [RouterLink],
  template: `<section class="hero">
    <p class="eyebrow">Room for your next idea</p>
    <h1>A fresh start.<br />A space that's yours.</h1>
    <p class="intro">
      Bring your ideas together in a private workspace, ready to become something of
      your own.
    </p>
    <div class="actions">
      <a class="button" routerLink="/sign-up">Create your account</a
      ><a routerLink="/sign-in">Sign in</a>
    </div>
    <p class="caption">Private by default. Simple by design.</p>
  </section>`,
})
export class HomeComponent {}
