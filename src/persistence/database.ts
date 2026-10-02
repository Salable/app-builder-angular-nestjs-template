import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

export interface DatabaseSession {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
}

export interface Database extends DatabaseSession {
  close(): Promise<void>;
  transaction<Result>(
    operation: (session: DatabaseSession) => Promise<Result>,
  ): Promise<Result>;
}

export class PostgresDatabase implements Database {
  readonly #pool: Pool;

  constructor(connectionString: string) {
    this.#pool = new Pool({
      allowExitOnIdle: true,
      connectionString,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      max: 5,
    });
    this.#pool.on("error", () => {
      console.error("An idle PostgreSQL connection failed.");
    });
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>> {
    return this.#pool.query<Row>(text, values);
  }

  async transaction<Result>(
    operation: (session: DatabaseSession) => Promise<Result>,
  ): Promise<Result> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(asSession(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

function asSession(client: PoolClient): DatabaseSession {
  return {
    query<Row extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<Row>> {
      return client.query<Row>(text, values);
    },
  };
}
