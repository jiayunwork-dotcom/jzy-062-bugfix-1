import { describe, expect, it } from 'vitest';
import { evaluateResonator } from '../src/acoustics/resonator.js';
import { END_CORRECTION_DELTA, soundSpeed } from '../src/constants.js';
import type { NormalizedResonator } from '../src/types.js';
import { band, calculate, classroomRequest, RESONATOR_500HZ } from './helpers.js';

const UNIT_RESONATOR: NormalizedResonator = {
  name: 'test-resonator',
  neckArea: 0.007854,
  neckLength: 0.05,
  cavityVolume: 0.000694,
  count: 1,
};

describe('Helmholtz resonator physics', () => {
  it('computes the effective neck length with the fixed end correction', () => {
    const r = evaluateResonator(UNIT_RESONATOR, soundSpeed(20));
    const expected = 0.05 + END_CORRECTION_DELTA * Math.sqrt(0.007854 / Math.PI);
    expect(r.effectiveNeckLength).toBeCloseTo(expected, 10);
    expect(r.effectiveNeckLength).toBeCloseTo(0.135, 3);
  });

  it('tunes the example geometry to the 500 Hz band at 20 °C', () => {
    const r = evaluateResonator(UNIT_RESONATOR, soundSpeed(20));
    expect(r.resonanceFrequency).toBeGreaterThan(490);
    expect(r.resonanceFrequency).toBeLessThan(510);
    expect(r.targetBand).toBe(500);
  });

  it('keeps sound speed, wavelength and f0 temperature-consistent', () => {
    const c20 = soundSpeed(20);
    expect(c20).toBeGreaterThan(342.5);
    expect(c20).toBeLessThan(344);
    const at20 = evaluateResonator(UNIT_RESONATOR, c20);
    const at0 = evaluateResonator(UNIT_RESONATOR, soundSpeed(0));
    // colder air ⇒ lower sound speed ⇒ lower resonance frequency
    expect(at0.resonanceFrequency).toBeLessThan(at20.resonanceFrequency);
    // wavelength is always c/f0 of the same temperature
    expect(at20.wavelength).toBeCloseTo(c20 / at20.resonanceFrequency, 10);
    expect(at0.wavelength).toBeCloseTo(soundSpeed(0) / at0.resonanceFrequency, 10);
    expect(at20.soundSpeed).toBeCloseTo(c20, 10);
  });

  it('concentrates absorption on its own band (Lorentzian selectivity)', () => {
    const r = evaluateResonator({ ...UNIT_RESONATOR, count: 100 }, soundSpeed(20));
    const c = r.bandContributions;
    expect(c[500]).toBeGreaterThan(10 * c[250]);
    expect(c[500]).toBeGreaterThan(10 * c[1000]);
    expect(c[500]).toBeGreaterThan(50 * c[125]);
    // peak contribution ≈ count × per-unit peak area
    expect(c[500]).toBeCloseTo(100 * r.peakAbsorptionAreaPerUnit, 0);
  });

  it('scales linearly with the unit count', () => {
    const one = evaluateResonator({ ...UNIT_RESONATOR, count: 1 }, soundSpeed(20));
    const ten = evaluateResonator({ ...UNIT_RESONATOR, count: 10 }, soundSpeed(20));
    expect(ten.bandContributions[500]).toBeCloseTo(10 * one.bandContributions[500], 8);
  });

  it('honours an explicit peak absorption area override', () => {
    const r = evaluateResonator(
      { ...UNIT_RESONATOR, count: 4, peakAbsorptionArea: 0.5 },
      soundSpeed(20),
    );
    expect(r.peakAbsorptionAreaPerUnit).toBe(0.5);
    expect(r.bandContributions[500]).toBeCloseTo(4 * 0.5, 1);
  });
});

describe('resonator inside the room calculation', () => {
  const baseline = calculate(classroomRequest());
  const withResonatorRequest = classroomRequest();
  withResonatorRequest.resonators = [RESONATOR_500HZ];
  const treated = calculate(withResonatorRequest);

  it('reports the resonator evaluation alongside the bands', () => {
    expect(treated.resonators).toHaveLength(1);
    expect(treated.resonators[0]!.targetBand).toBe(500);
    expect(treated.resonators[0]!.resonanceFrequency).toBeGreaterThan(490);
    expect(treated.resonators[0]!.resonanceFrequency).toBeLessThan(510);
  });

  it('lowers the 500 Hz T60 for both models', () => {
    expect(band(treated, 500).sabine.t60!).toBeLessThan(band(baseline, 500).sabine.t60!);
    expect(band(treated, 500).eyring.t60!).toBeLessThan(band(baseline, 500).eyring.t60!);
  });

  it('hits the target band far harder than its neighbours', () => {
    const drop = (f: number) =>
      (band(baseline, f).sabine.t60! - band(treated, f).sabine.t60!) / band(baseline, f).sabine.t60!;
    expect(drop(500)).toBeGreaterThan(0.05);
    expect(drop(500)).toBeGreaterThan(5 * drop(250));
    expect(drop(500)).toBeGreaterThan(5 * drop(1000));
    expect(drop(125)).toBeLessThan(0.005);
  });

  it('recomputes the curve from the enlarged absorption — no hand-tuned subtraction', () => {
    // The with-resonator T60 must equal 0.161·V / (A_baseline + A_resonator)
    // exactly, i.e. the engine re-ran the model on the new absorption.
    const volume = treated.room.volume;
    for (const f of [125, 250, 500, 1000, 2000, 4000] as const) {
      const base = band(baseline, f);
      const extra = treated.resonators[0]!.bandContributions[f];
      const expected = (0.161 * volume) / (base.absorption.total + extra);
      expect(band(treated, f).sabine.t60!).toBeCloseTo(expected, 8);
      expect(band(treated, f).absorption.resonators).toBeCloseTo(extra, 8);
    }
  });

  it('feeds the resonator absorption into the Eyring mean as well', () => {
    const s = treated.room.totalSurfaceArea;
    const b500 = band(treated, 500);
    expect(b500.meanAlpha).toBeCloseTo(b500.absorption.surface / s, 10);
    expect(b500.meanAlpha).toBeGreaterThan(band(baseline, 500).meanAlpha);
  });
});
