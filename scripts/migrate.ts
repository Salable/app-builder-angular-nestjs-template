import { PostgresDatabase } from "../src/persistence/database";
import { migrateToLatest, rollbackLastMigration } from "../src/persistence/migrator";

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString.trim() === "") {
  throw new Error("DATABASE_URL is required to run generated-app migrations.");
}

const database = new PostgresDatabase(connectionString);
try {
  if (process.argv.includes("--rollback")) {
    const rolledBack = await rollbackLastMigration(database);
    console.log(
      rolledBack === undefined
        ? "No migration was available to roll back."
        : `Rolled back migration ${rolledBack.version}.`,
    );
  } else {
    const applied = await migrateToLatest(database);
    console.log(
      `Database is current at migration ${applied.at(-1)?.version ?? "none"}.`,
    );
  }
} finally {
  await database.close();
}
