import { All, Controller, Get, Inject, Req, Res } from "@nestjs/common";
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AuthenticationService } from "./authentication.service";
import { schemaRef } from "./openapi-schemas";

@Controller("api")
export class ApplicationController {
  constructor(
    @Inject(AuthenticationService)
    private readonly authentication: AuthenticationService,
  ) {}

  @Get("v1/health")
  @ApiTags("Health")
  @ApiOperation({ summary: "Read application health" })
  @ApiOkResponse({
    schema: {
      type: "object",
      required: ["status", "apiVersion"],
      properties: {
        status: { type: "string", enum: ["ok"] },
        apiVersion: { type: "string", enum: ["v1"] },
      },
    },
  })
  getHealth() {
    return { status: "ok", apiVersion: "v1" };
  }

  @Get("v1/session")
  @ApiTags("Session")
  @ApiOperation({
    summary: "Read the current signed-in user, or null when signed out",
  })
  @ApiOkResponse({ schema: schemaRef("SessionDto") })
  async getSession(@Req() request: Request) {
    return { user: await this.authentication.currentUser(request) };
  }

  @All("auth/*path") @ApiExcludeEndpoint() auth(
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.authentication.handle(request, response);
  }
}
