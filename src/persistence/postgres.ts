import pg from 'pg';
import type {
  CalculationRecord,
  CalculationSummary,
  CalculationRequest,
  CalculationResult,
} from '../types.js';
import type { CalculationsRepository } from './repository.js';
import { SCHEMA_SQL } from './schema.js';

interface CalculationRow {
  id: string;
  name: string;
  created_at: Date;
  request: CalculationRequest;
  result: CalculationResult;
}

/**
 * PostgreSQL-backed repository. Each calculation is stored as an independent
 * row; the connection pool keeps concurrent submissions isolated from one
 * another.
 */
export class PostgresCalculationsRepository implements CalculationsRepository {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10 });
  }

  /** Applies the schema, retrying while the database is still starting up. */
  async init(retries = 15, delayMs = 1000): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        await this.pool.query(SCHEMA_SQL);
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error(`could not initialize database schema: ${String(lastError)}`);
  }

  async save(record: CalculationRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO calculations (id, name, created_at, request, result)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        record.id,
        record.name,
        record.createdAt,
        JSON.stringify(record.request),
        JSON.stringify(record.result),
      ],
    );
  }

  async findById(id: string): Promise<CalculationRecord | null> {
    const { rows } = await this.pool.query<CalculationRow>(
      `SELECT id, name, created_at, request, result FROM calculations WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at.toISOString(),
      request: row.request as CalculationRecord['request'],
      result: row.result,
    };
  }

  async list(limit = 100): Promise<CalculationSummary[]> {
    const { rows } = await this.pool.query<{ id: string; name: string; created_at: Date }>(
      `SELECT id, name, created_at FROM calculations ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
