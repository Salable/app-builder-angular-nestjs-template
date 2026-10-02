import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { openApiSchemas } from "./openapi-schemas";

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("Application API")
    .setVersion("1.0.0")
    .setDescription(
      "Resource API. Authentication uses the same-origin /api/auth session cookie.",
    )
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (_controller, method) => method,
  });
  document.components = {
    ...document.components,
    schemas: { ...document.components?.schemas, ...openApiSchemas() },
  };
  return document;
}

export function serveOpenApi(app: INestApplication) {
  SwaggerModule.setup("api/docs", app, () => createOpenApiDocument(app), {
    ui: false,
    raw: ["json"],
    jsonDocumentUrl: "/api/v1/openapi.json",
  });
}
