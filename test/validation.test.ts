import { describe, expect, it } from 'vitest';
import { validateCalculationRequest } from '../src/validation.js';
import { classroomRequest } from './helpers.js';

function expectRejected(payload: unknown, fieldFragment: string) {
  const result = validateCalculationRequest(payload);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.errors.length).toBeGreaterThan(0);
  for (const error of result.errors) {
    expect(typeof error.field).toBe('string');
    expect(error.field.length).toBeGreaterThan(0);
    expect(typeof error.reason).toBe('string');
    expect(error.reason.length).toBeGreaterThan(0);
  }
  expect(result.errors.some((e) => e.field.includes(fieldFragment))).toBe(true);
}

describe('validation of a well-formed request', () => {
  it('accepts the classroom preset and applies defaults', () => {
    const result = validateCalculationRequest(classroomRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.air.temperatureCelsius).toBe(20);
    expect(result.value.name).toBe('classroom-preset');
    expect(result.value.room.surfaces.length).toBe(3);
  });

  it('accepts absorption coefficients on the [0, 1] boundaries', () => {
    const request = classroomRequest();
    for (const key of Object.keys(request.room.surfaces[0]!.absorption)) {
      request.room.surfaces[0]!.absorption[key] = key === '125' ? 0 : 1;
    }
    expect(validateCalculationRequest(request).ok).toBe(true);
  });
});

describe('room geometry rejection', () => {
  it.each([0, -10, Number.NaN, Number.POSITIVE_INFINITY, '200'])(
    'rejects non-positive or non-numeric volume: %s',
    (volume) => {
      const request = classroomRequest();
      (request.room as { volume: unknown }).volume = volume;
      expectRejected(request, 'room.volume');
    },
  );

  it.each([0, -5, Number.NaN])('rejects non-positive surface area: %s', (area) => {
    const request = classroomRequest();
    (request.room.surfaces[0] as { area: unknown }).area = area;
    expectRejected(request, 'room.surfaces[0].area');
  });

  it('rejects a missing surface list and an empty one', () => {
    const missing = classroomRequest() as Record<string, unknown>;
    delete (missing.room as Record<string, unknown>).surfaces;
    expectRejected(missing, 'room.surfaces');

    const empty = classroomRequest();
    empty.room.surfaces = [];
    expectRejected(empty, 'room.surfaces');
  });

  it('rejects a non-object body', () => {
    expectRejected('not an object', 'body');
    expectRejected(null, 'body');
    expectRejected([1, 2, 3], 'body');
  });
});

describe('absorption coefficient rejection', () => {
  it.each([1.5, -0.1, Number.NaN, 'high'])('rejects out-of-range coefficient: %s', (alpha) => {
    const request = classroomRequest();
    (request.room.surfaces[1]!.absorption as Record<string, unknown>)['500'] = alpha;
    expectRejected(request, 'absorption.500');
  });

  it('rejects a missing octave band', () => {
    const request = classroomRequest();
    delete request.room.surfaces[0]!.absorption['1000'];
    expectRejected(request, 'absorption.1000');
  });

  it('rejects unknown band keys', () => {
    const request = classroomRequest();
    request.room.surfaces[0]!.absorption['8000'] = 0.5;
    expectRejected(request, 'absorption.8000');
  });

  it('rejects a non-object absorption block', () => {
    const request = classroomRequest();
    (request.room.surfaces[0] as { absorption: unknown }).absorption = 0.5;
    expectRejected(request, 'absorption');
  });
});

describe('resonator geometry rejection', () => {
  function withResonator(patch: Record<string, unknown>) {
    const request = classroomRequest();
    request.resonators = [
      { neckArea: 0.007854, neckLength: 0.05, cavityVolume: 0.000694, ...patch },
    ];
    return request;
  }

  it('rejects a negative neck length', () => {
    expectRejected(withResonator({ neckLength: -0.05 }), 'resonators[0].neckLength');
  });

  it('rejects a zero-length neck', () => {
    expectRejected(withResonator({ neckLength: 0 }), 'resonators[0].neckLength');
  });

  it('rejects a zero-volume cavity', () => {
    expectRejected(withResonator({ cavityVolume: 0 }), 'resonators[0].cavityVolume');
  });

  it('rejects a non-positive neck area', () => {
    expectRejected(withResonator({ neckArea: 0 }), 'resonators[0].neckArea');
    expectRejected(withResonator({ neckArea: -1 }), 'resonators[0].neckArea');
  });

  it('rejects a non-integer or non-positive unit count', () => {
    expectRejected(withResonator({ count: 1.5 }), 'resonators[0].count');
    expectRejected(withResonator({ count: 0 }), 'resonators[0].count');
  });

  it('rejects a non-positive peak absorption override', () => {
    expectRejected(withResonator({ peakAbsorptionArea: -0.2 }), 'resonators[0].peakAbsorptionArea');
  });
});

describe('air parameter rejection', () => {
  it('rejects a non-numeric or implausible temperature', () => {
    const request = classroomRequest();
    request.air = { temperatureCelsius: 'warm' as unknown as number };
    expectRejected(request, 'air.temperatureCelsius');

    const hot = classroomRequest();
    hot.air = { temperatureCelsius: 100 };
    expectRejected(hot, 'air.temperatureCelsius');
  });
});
