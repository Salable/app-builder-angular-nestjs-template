import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Database, DatabaseSession } from "./database";

const MIGRATION_LOCK_ID = 1_894_278_641;
const MIGRATION_PATTERN = /^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$/;

export type AppliedMigration = {
  checksum: string;
  version: string;
};

type Migration = AppliedMigration & {
  down: string;
  name: string;
  up: string;
};

export async function migrateToLatest(
  database: Database,
  migrationDirectory = defaultMigrationDirectory(),
): Promise<AppliedMigration[]> {
  const migrations = await loadMigrations(migrationDirectory);

  return database.transaction(async (session) => {
    await prepareMigrationSession(session);
    const applied = await readAppliedMigrations(session);
    verifyAppliedChecksums(applied, migrations);

    const appliedVersions = new Set(applied.map(({ version }) => version));
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;
      await session.query(migration.up);
      await session.query(
        `INSERT INTO app_builder_migrations (version, name, checksum)
         VALUES ($1, $2, $3)`,
        [migration.version, migration.name, migration.checksum],
      );
    }

    return readAppliedMigrations(session);
  });
}

export async function rollbackLastMigration(
  database: Database,
  migrationDirectory = defaultMigrationDirectory(),
): Promise<AppliedMigration | undefined> {
  const migrations = await loadMigrations(migrationDirectory);

  return database.transaction(async (session) => {
    await prepareMigrationSession(session);
    const applied = await readAppliedMigrations(session);
    verifyAppliedChecksums(applied, migrations);
    const latest = applied.at(-1);
    if (latest === undefined) return undefined;

    const migration = migrations.find(({ version }) => version === latest.version);
    if (migration === undefined) {
      throw new Error(`Applied migration ${latest.version} has no source file.`);
    }

    await session.query(migration.down);
    await session.query("DELETE FROM app_builder_migrations WHERE version = $1", [
      migration.version,
    ]);
    return latest;
  });
}

function defaultMigrationDirectory(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations");
}

async function loadMigrations(directory: string): Promise<Migration[]> {
  const entries = await readdir(directory);
  const sources = new Map<string, { down?: string; name: string; up?: string }>();

  for (const entry of entries.sort()) {
    const match = MIGRATION_PATTERN.exec(entry);
    if (match === null) continue;
    const [, version, name, direction] = match;
    if (version === undefined || name === undefined || direction === undefined) {
      throw new Error(`Invalid migration filename ${entry}.`);
    }
    const source = await readFile(path.join(directory, entry), "utf8");
    const migration = sources.get(version) ?? { name };
    if (migration.name !== name) {
      throw new Error(`Migration ${version} uses inconsistent names.`);
    }
    migration[direction as "up" | "down"] = source;
    sources.set(version, migration);
  }

  return [...sources.entries()].map(([version, migration]) => {
    if (migration.up === undefined || migration.down === undefined) {
      throw new Error(`Migration ${version} requires paired up and down files.`);
    }
    return {
      checksum: checksum(migration.up),
      down: migration.down,
      name: migration.name,
      up: migration.up,
      version,
    };
  });
}

async function prepareMigrationSession(session: DatabaseSession): Promise<void> {
  await session.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_ID]);
  await session.query(`
    CREATE TABLE IF NOT EXISTS app_builder_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
    )
  `);
}

async function readAppliedMigrations(
  session: DatabaseSession,
): Promise<AppliedMigration[]> {
  const result = await session.query<AppliedMigration>(
    `SELECT version, checksum
     FROM app_builder_migrations
     ORDER BY version`,
  );
  return result.rows;
}

function verifyAppliedChecksums(
  applied: AppliedMigration[],
  migrations: Migration[],
): void {
  const byVersion = new Map(
    migrations.map((migration) => [migration.version, migration]),
  );
  for (const migration of applied) {
    const source = byVersion.get(migration.version);
    if (source === undefined) {
      throw new Error(`Applied migration ${migration.version} has no source file.`);
    }
    if (source.checksum !== migration.checksum) {
      throw new Error(`Applied migration ${migration.version} was modified.`);
    }
  }
}

function checksum(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}
