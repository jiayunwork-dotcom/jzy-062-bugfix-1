import type { CalculationRecord, CalculationSummary } from '../types.js';

/**
 * Persistence port for calculation records. Implementations must keep
 * records fully isolated from each other: concurrent submissions of
 * different room schemes must never see each other's data.
 */
export interface CalculationsRepository {
  save(record: CalculationRecord): Promise<void>;
  findById(id: string): Promise<CalculationRecord | null>;
  list(limit?: number): Promise<CalculationSummary[]>;
  close(): Promise<void>;
}

/**
 * In-memory implementation, used for tests and for running the service
 * without a database. Records are deep-copied on the way in and out so
 * callers can never mutate stored state (and vice versa).
 */
export class InMemoryCalculationsRepository implements CalculationsRepository {
  private readonly records = new Map<string, CalculationRecord>();

  async save(record: CalculationRecord): Promise<void> {
    this.records.set(record.id, structuredClone(record));
  }

  async findById(id: string): Promise<CalculationRecord | null> {
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  async list(limit = 100): Promise<CalculationSummary[]> {
    return [...this.records.values()]
      .map(({ id, name, createdAt }) => ({ id, name, createdAt }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async close(): Promise<void> {
    this.records.clear();
  }
}
