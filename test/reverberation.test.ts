import { describe, expect, it } from 'vitest';
import { AIR_ATTENUATION, OCTAVE_BANDS, SABINE_CONSTANT, SCHROEDER_CONSTANT } from '../src/constants.js';
import { band, calculate, classroomRequest } from './helpers.js';

describe('classroom preset magnitudes', () => {
  const result = calculate(classroomRequest());

  it('covers exactly the fixed octave bands 125–4000 Hz', () => {
    expect(result.bands.map((b) => b.frequency)).toEqual([...OCTAVE_BANDS]);
  });

  it('produces positive reverberation times in every band (no negative T60 anywhere)', () => {
    for (const b of result.bands) {
      expect(b.sabine.t60, `Sabine T60 @ ${b.frequency} Hz`).toBeGreaterThan(0);
      expect(b.eyring.t60, `Eyring T60 @ ${b.frequency} Hz`).toBeGreaterThan(0);
    }
  });

  it('keeps mid-frequency Sabine T60 in the plausible 0.x–2 s range', () => {
    for (const f of [500, 1000, 2000]) {
      const t60 = band(result, f).sabine.t60!;
      expect(t60).toBeGreaterThan(0.2);
      expect(t60).toBeLessThanOrEqual(2);
    }
    // and no band of the classroom exceeds 2 s either
    for (const b of result.bands) {
      expect(b.sabine.t60!).toBeLessThanOrEqual(2);
    }
  });

  it('applies the 4·m·V air-absorption term with the fixed m table', () => {
    const volume = result.room.volume;
    expect(band(result, 4000).absorption.air).toBeCloseTo(4 * AIR_ATTENUATION[4000] * volume, 10);
    expect(band(result, 125).absorption.air).toBe(0);
  });
});

describe('Sabine vs Eyring behaviour', () => {
  function singleSurfaceRoom(alpha: number) {
    return {
      name: 'single-surface-room',
      room: {
        volume: 100,
        surfaces: [
          {
            name: 'walls',
            area: 100,
            absorption: { '125': alpha, '250': alpha, '500': alpha, '1000': alpha, '2000': alpha, '4000': alpha },
          },
        ],
      },
    };
  }

  it('nearly agree when the mean absorption is low (ᾱ → 0)', () => {
    const result = calculate(singleSurfaceRoom(0.02));
    // compare on the bands without air absorption, where the two models
    // must converge to the same diffuse-field limit
    for (const f of [125, 250, 500]) {
      const b = band(result, f);
      const relativeGap = (b.sabine.t60! - b.eyring.t60!) / b.sabine.t60!;
      expect(relativeGap).toBeLessThan(0.05);
    }
  });

  it('Eyring is markedly shorter than Sabine at high absorption', () => {
    const result = calculate(singleSurfaceRoom(0.95));
    const b500 = band(result, 500);
    expect(b500.eyring.t60!).toBeLessThan(0.6 * b500.sabine.t60!);
    // Eyring must never exceed Sabine — a flipped ln sign would break this
    for (const b of result.bands) {
      expect(b.eyring.t60!).toBeLessThan(b.sabine.t60!);
      expect(b.eyring.t60!).toBeGreaterThan(0);
    }
  });

  it('Eyring never exceeds Sabine across the classroom bands', () => {
    const result = calculate(classroomRequest());
    for (const b of result.bands) {
      expect(b.eyring.t60!).toBeLessThanOrEqual(b.sabine.t60!);
    }
  });
});

describe('monotonicity: more absorption ⇒ shorter T60, longer critical distance', () => {
  const baseline = calculate(classroomRequest());

  const moreAbsorptive = classroomRequest();
  for (const surface of moreAbsorptive.room.surfaces) {
    for (const key of Object.keys(surface.absorption)) {
      surface.absorption[key] = Math.min(1, surface.absorption[key] * 1.5 + 0.05);
    }
  }
  const treated = calculate(moreAbsorptive);

  it('T60 decreases in every band for both models', () => {
    for (const f of OCTAVE_BANDS) {
      expect(band(treated, f).sabine.t60!).toBeLessThan(band(baseline, f).sabine.t60!);
      expect(band(treated, f).eyring.t60!).toBeLessThan(band(baseline, f).eyring.t60!);
    }
  });

  it('critical distance increases in every band for both models', () => {
    for (const f of OCTAVE_BANDS) {
      expect(band(treated, f).sabine.criticalDistance!).toBeGreaterThan(band(baseline, f).sabine.criticalDistance!);
      expect(band(treated, f).eyring.criticalDistance!).toBeGreaterThan(band(baseline, f).eyring.criticalDistance!);
    }
  });
});

describe('derived quantities are consistent with the computed T60', () => {
  const result = calculate(classroomRequest());
  const volume = result.room.volume;

  it('Schroeder frequency uses this band’s own T60: f_s = 2000·√(T60/V)', () => {
    for (const b of result.bands) {
      for (const model of [b.sabine, b.eyring]) {
        const expected = SCHROEDER_CONSTANT * Math.sqrt(model.t60! / volume);
        expect(model.schroederFrequency!).toBeCloseTo(expected, 6);
      }
    }
  });

  it('critical distance satisfies dc = √(A_eff / 16π) ∝ √(V/T60)', () => {
    for (const b of result.bands) {
      expect(b.sabine.criticalDistance!).toBeCloseTo(Math.sqrt(b.absorption.total / (16 * Math.PI)), 8);
      // Sabine dc follows the 0.057·√(V/T60) proportionality
      expect(b.sabine.criticalDistance!).toBeCloseTo(0.057 * Math.sqrt(volume / b.sabine.t60!), 1);
    }
  });

  it('Sabine T60 equals 0.161·V/A with the shared constant', () => {
    for (const b of result.bands) {
      expect(b.sabine.t60!).toBeCloseTo((SABINE_CONSTANT * volume) / b.absorption.total, 8);
    }
  });
});

describe('Sabine–Eyring agreement limits', () => {
  function uniformRoom(alpha: number) {
    return {
      room: {
        volume: 200,
        surfaces: [
          {
            area: 200,
            absorption: { '125': alpha, '250': alpha, '500': alpha, '1000': alpha, '2000': alpha, '4000': alpha },
          },
        ],
      },
    };
  }

  it('low absorption: Sabine ≈ Eyring (diffuse-field limit)', () => {
    const result = calculate(uniformRoom(0.05));
    const b = band(result, 500);
    expect(Math.abs(b.sabine.t60! - b.eyring.t60!) / b.sabine.t60!).toBeLessThan(0.03);
  });

  it('high absorption: models diverge with Eyring shorter, both positive', () => {
    const result = calculate(uniformRoom(0.9));
    const b = band(result, 500);
    expect(b.eyring.t60!).toBeLessThan(0.5 * b.sabine.t60!);
    expect(b.eyring.t60!).toBeGreaterThan(0);
    expect(b.sabine.t60!).toBeGreaterThan(0);
  });
});

describe('Eyring air attenuation (regression: high-frequency freeze in low-absorption rooms)', () => {
  // The reported case: V = 200 m³, S = 200 m², one uniform material with a
  // very low α = 0.03 in every band. Surface absorption is then only 6 m²,
  // so the 4·m·V air term dominates the high bands. Before the fix Eyring
  // omitted that term, so its T60 stayed frozen at the 500 Hz value while
  // Sabine kept falling — and Eyring ended up nearly twice *longer* at 4 kHz.
  function sparseRoom() {
    return {
      room: {
        volume: 200,
        surfaces: [
          {
            name: 'uniform-light',
            area: 200,
            absorption: { '125': 0.03, '250': 0.03, '500': 0.03, '1000': 0.03, '2000': 0.03, '4000': 0.03 },
          },
        ],
      },
    };
  }

  const result = calculate(sparseRoom());

  it('keeps the low bands (no air term) unchanged: models close, ~5.3 s', () => {
    for (const f of [125, 250, 500] as const) {
      const b = band(result, f);
      expect(b.sabine.t60!).toBeCloseTo(5.37, 1);
      expect(b.eyring.t60!).toBeCloseTo(5.29, 1);
      expect(b.eyring.t60!).toBeLessThan(b.sabine.t60!);
      expect((b.sabine.t60! - b.eyring.t60!) / b.sabine.t60!).toBeLessThan(0.02);
    }
  });

  it('Eyring follows Sabine down through the air-damped high bands', () => {
    const highBands = [1000, 2000, 4000] as const;
    const pairs = highBands.map((f) => ({
      f,
      sabine: band(result, f).sabine.t60!,
      eyring: band(result, f).eyring.t60!,
    }));

    for (const { f, sabine, eyring } of pairs) {
      // never longer than Sabine — the reported inversion
      expect(eyring, `Eyring exceeds Sabine @ ${f} Hz`).toBeLessThan(sabine);
      // low surface absorption ⇒ models stay close even with air damping
      expect((sabine - eyring) / sabine, `gap @ ${f} Hz`).toBeLessThan(0.02);
    }

    // Eyring must fall from band to band instead of freezing at the 500 Hz value
    expect(pairs[0]!.eyring).toBeLessThan(band(result, 500).eyring.t60!);
    expect(pairs[1]!.eyring).toBeLessThan(pairs[0]!.eyring);
    expect(pairs[2]!.eyring).toBeLessThan(pairs[1]!.eyring);

    // pinned to the physically expected values for this room
    expect(pairs[0]!.sabine).toBeCloseTo(4.24, 2);
    expect(pairs[1]!.sabine).toBeCloseTo(3.5, 2);
    expect(pairs[2]!.sabine).toBeCloseTo(2.44, 2);
    expect(pairs[0]!.eyring).toBeCloseTo(4.19, 2);
    expect(pairs[1]!.eyring).toBeCloseTo(3.47, 2);
    expect(pairs[2]!.eyring).toBeCloseTo(2.42, 2);
  });

  it('counts air absorption in the Eyring effective absorption (dc ∝ √(V/T60))', () => {
    for (const f of [1000, 2000, 4000] as const) {
      const b = band(result, f);
      expect(b.eyring.criticalDistance!).toBeCloseTo(
        0.057 * Math.sqrt(200 / b.eyring.t60!),
        1,
      );
    }
  });
});
