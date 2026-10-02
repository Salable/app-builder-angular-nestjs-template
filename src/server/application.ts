import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express from "express";
import { ApplicationController } from "./application.controller";
import { AuthenticationService } from "./authentication.service";
import { NotesService } from "./notes.service";
import { ProblemDetailFilter } from "./problem-detail";
import { NotesController } from "./notes.controller";
import { serveOpenApi } from "./openapi";

@Module({
  controllers: [ApplicationController, NotesController],
  providers: [AuthenticationService, NotesService],
})
class ApplicationModule {}

export async function createApplication(staticDirectory?: string) {
  const handler = express();
  handler.disable("x-powered-by");
  handler.use("/api", (_request, response, next) => {
    response.setHeader("Cache-Control", "private, no-store");
    next();
  });
  const app = await NestFactory.create(ApplicationModule, new ExpressAdapter(handler), {
    logger: false,
  });
  app.useGlobalFilters(new ProblemDetailFilter());
  serveOpenApi(app);
  if (staticDirectory) {
    handler.use(express.static(staticDirectory));
    handler.get(/^\/(?!api(?:\/|$)).*/, (_request, response) => {
      response.sendFile("index.html", { root: staticDirectory });
    });
  }
  await app.init();
  return { app, handler };
}
