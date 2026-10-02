import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import type { CreateNoteDto, UpdateNoteDto } from "../contracts/api";
import { AuthenticationService } from "./authentication.service";
import { NotesService } from "./notes.service";
import { schemaRef } from "./openapi-schemas";

@ApiTags("Notes")
@ApiResponse({
  status: 400,
  description: "Invalid request.",
  content: { "application/problem+json": { schema: schemaRef("ProblemDetail") } },
})
@ApiResponse({
  status: 401,
  description: "Sign-in required.",
  content: { "application/problem+json": { schema: schemaRef("ProblemDetail") } },
})
@ApiResponse({
  status: 403,
  description: "Request origin is not allowed.",
  content: { "application/problem+json": { schema: schemaRef("ProblemDetail") } },
})
@ApiResponse({
  status: 404,
  description: "No owned note matches this ID.",
  content: { "application/problem+json": { schema: schemaRef("ProblemDetail") } },
})
@Controller("api/v1/notes")
export class NotesController {
  constructor(
    @Inject(AuthenticationService)
    private readonly authentication: AuthenticationService,
    @Inject(NotesService) private readonly notes: NotesService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List the signed-in user's notes" })
  @ApiOkResponse({ schema: schemaRef("NotesDto") })
  async listNotes(@Req() request: Request) {
    const user = await this.authentication.requireUser(request);
    return this.notes.list(user.userId);
  }

  @Get(":noteId")
  @ApiParam({
    name: "noteId",
    type: "string",
    format: "uuid",
    description: "The note's unique ID.",
  })
  @ApiOperation({ summary: "Read a note owned by the signed-in user" })
  @ApiOkResponse({ schema: schemaRef("NoteDto") })
  async getNote(@Req() request: Request, @Param("noteId") noteId: string) {
    const user = await this.authentication.requireUser(request);
    return this.notes.read(user.userId, noteId);
  }

  @Post()
  @ApiBody({ schema: schemaRef("CreateNoteDto") })
  @ApiOperation({ summary: "Create a private note" })
  @ApiCreatedResponse({ schema: schemaRef("NoteDto") })
  async createNote(@Req() request: Request, @Body() body: CreateNoteDto) {
    this.authentication.assertSameOrigin(request);
    const user = await this.authentication.requireUser(request);
    return this.notes.create(user.userId, body);
  }

  @Patch(":noteId")
  @ApiParam({
    name: "noteId",
    type: "string",
    format: "uuid",
    description: "The note's unique ID.",
  })
  @ApiBody({ schema: schemaRef("UpdateNoteDto") })
  @ApiOperation({ summary: "Update a private note's content" })
  @ApiOkResponse({ schema: schemaRef("NoteDto") })
  async updateNote(
    @Req() request: Request,
    @Param("noteId") noteId: string,
    @Body() body: UpdateNoteDto,
  ) {
    this.authentication.assertSameOrigin(request);
    const user = await this.authentication.requireUser(request);
    return this.notes.update(user.userId, noteId, body);
  }

  @Delete(":noteId")
  @HttpCode(204)
  @ApiParam({
    name: "noteId",
    type: "string",
    format: "uuid",
    description: "The note's unique ID.",
  })
  @ApiOperation({ summary: "Delete a private note" })
  @ApiNoContentResponse({ description: "The note was deleted." })
  async deleteNote(@Req() request: Request, @Param("noteId") noteId: string) {
    this.authentication.assertSameOrigin(request);
    const user = await this.authentication.requireUser(request);
    await this.notes.remove(user.userId, noteId);
  }
}
