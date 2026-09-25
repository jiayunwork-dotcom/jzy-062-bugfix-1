import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { InMemoryCalculationsRepository } from '../src/persistence/repository.js';
import type { CalculationRecord } from '../src/types.js';
import { classroomRequest, RESONATOR_500HZ } from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({ repository: new InMemoryCalculationsRepository() });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

async function postCalculation(payload: unknown) {
  return app.inject({ method: 'POST', url: '/calculations', payload: payload as Record<string, unknown> });
}

describe('service endpoints', () => {
  it('GET /health reports ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /presets/classroom serves the classroom-scale example', async () => {
    const res = await app.inject({ method: 'GET', url: '/presets/classroom' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.room.volume).toBeGreaterThan(0);
    expect(body.room.surfaces.length).toBeGreaterThan(0);
  });
});

describe('POST /calculations', () => {
  it('computes and persists a classroom calculation', async () => {
    const res = await postCalculation(classroomRequest());
    expect(res.statusCode).toBe(201);
    const record = res.json() as CalculationRecord;
    expect(record.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(record.name).toBe('classroom-preset');
    expect(record.result.bands).toHaveLength(6);
    const t500 = record.result.bands.find((b) => b.frequency === 500)!.sabine.t60!;
    expect(t500).toBeGreaterThan(0.2);
    expect(t500).toBeLessThanOrEqual(2);

    // persisted: the same record is retrievable afterwards
    const fetched = await app.inject({ method: 'GET', url: `/calculations/${record.id}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toEqual(record);

    const list = await app.inject({ method: 'GET', url: '/calculations' });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.some((item: { id: string }) => item.id === record.id)).toBe(true);
  });

  it('rejects an out-of-range absorption coefficient with a reasoned error', async () => {
    const payload = classroomRequest();
    payload.room.surfaces[0]!.absorption['500'] = 1.4;
    const res = await postCalculation(payload);
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details.length).toBeGreaterThan(0);
    expect(body.error.details[0].field).toContain('absorption');
    expect(typeof body.error.details[0].reason).toBe('string');
  });

  it('rejects illegal geometry (negative volume, zero cavity) with reasons', async () => {
    const badVolume = classroomRequest();
    badVolume.room.volume = -12;
    const res1 = await postCalculation(badVolume);
    expect(res1.statusCode).toBe(400);
    expect(res1.json().error.details.some((d: { field: string }) => d.field === 'room.volume')).toBe(true);

    const badResonator = classroomRequest();
    badResonator.resonators = [{ neckArea: 0.01, neckLength: 0.05, cavityVolume: 0 }];
    const res2 = await postCalculation(badResonator);
    expect(res2.statusCode).toBe(400);
    expect(res2.json().error.details.some((d: { field: string }) => d.field.includes('cavityVolume'))).toBe(true);
  });

  it('returns a structured 404 for unknown records', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/calculations/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

describe('resonator behaviour through the API', () => {
  it('only the 500 Hz band is meaningfully damped by a 500 Hz resonator', async () => {
    const bare = (await postCalculation(classroomRequest())).json() as CalculationRecord;

    const withResonator = classroomRequest();
    withResonator.name = 'classroom-with-resonator';
    withResonator.resonators = [RESONATOR_500HZ];
    const treated = (await postCalculation(withResonator)).json() as CalculationRecord;

    const t60 = (record: CalculationRecord, f: number) =>
      record.result.bands.find((b) => b.frequency === f)!.sabine.t60!;

    expect(t60(treated, 500)).toBeLessThan(t60(bare, 500));
    const drop = (f: number) => (t60(bare, f) - t60(treated, f)) / t60(bare, f);
    expect(drop(500)).toBeGreaterThan(5 * drop(250));
    expect(drop(500)).toBeGreaterThan(5 * drop(1000));
  });
});

describe('concurrent submissions stay isolated', () => {
  it('eight simultaneous room schemes never see each other’s data', async () => {
    const payloads = Array.from({ length: 8 }, (_, i) => {
      const request = classroomRequest();
      request.name = `concurrent-room-${i}`;
      request.room.volume = 100 + i * 25;
      return request;
    });

    const responses = await Promise.all(payloads.map((p) => postCalculation(p)));
    const records = responses.map((r) => {
      expect(r.statusCode).toBe(201);
      return r.json() as CalculationRecord;
    });

    // all ids unique
    expect(new Set(records.map((r) => r.id)).size).toBe(records.length);

    // each record, when re-fetched, still carries its own request and result
    const fetched = await Promise.all(
      records.map((r) => app.inject({ method: 'GET', url: `/calculations/${r.id}` })),
    );
    fetched.forEach((res, i) => {
      const record = res.json() as CalculationRecord;
      expect(record.name).toBe(`concurrent-room-${i}`);
      expect(record.request.room.volume).toBe(100 + i * 25);
      expect(record.result.room.volume).toBe(100 + i * 25);
    });
  });
});
