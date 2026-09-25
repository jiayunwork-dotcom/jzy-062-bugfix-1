import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PostgresCalculationsRepository } from '../src/persistence/postgres.js';
import type { CalculationRecord } from '../src/types.js';
import { calculate, classroomRequest, normalize } from './helpers.js';

/**
 * Integration test against a real PostgreSQL 16 instance. Skipped unless
 * TEST_DATABASE_URL is set — inside the Docker composition it is, via
 *   docker compose --profile test run --rm tests
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PostgresCalculationsRepository (integration)', () => {
  const repository = new PostgresCalculationsRepository(url!);

  afterAll(async () => {
    await repository.close();
  });

  function makeRecord(name: string, volume: number): CalculationRecord {
    const request = classroomRequest();
    request.name = name;
    request.room.volume = volume;
    const normalized = normalize(request);
    return {
      id: randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      request: normalized,
      result: calculate(request),
    };
  }

  it('initializes the schema and round-trips records without cross-talk', async () => {
    await repository.init();

    const a = makeRecord(`pg-room-a-${randomUUID()}`, 150);
    const b = makeRecord(`pg-room-b-${randomUUID()}`, 400);
    await Promise.all([repository.save(a), repository.save(b)]);

    const fetchedA = await repository.findById(a.id);
    const fetchedB = await repository.findById(b.id);
    expect(fetchedA).toEqual(a);
    expect(fetchedB).toEqual(b);
    expect(fetchedA!.result.room.volume).toBe(150);
    expect(fetchedB!.result.room.volume).toBe(400);

    expect(await repository.findById(randomUUID())).toBeNull();

    const list = await repository.list();
    expect(list.some((item) => item.id === a.id)).toBe(true);
    expect(list.some((item) => item.id === b.id)).toBe(true);
  });
});
