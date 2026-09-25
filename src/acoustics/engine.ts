import {
  AIR_ATTENUATION,
  END_CORRECTION_DELTA,
  LORENTZIAN_HALF_WIDTH_RATIO,
  OCTAVE_BANDS,
  SABINE_CONSTANT,
  SCHROEDER_CONSTANT,
  soundSpeed,
} from '../constants.js';
import type {
  BandResult,
  CalculationResult,
  NormalizedRequest,
} from '../types.js';
import { evaluateResonator } from './resonator.js';
import { eyring, sabine } from './reverberation.js';

/**
 * Runs a full room-acoustics calculation for a validated request.
 *
 * Per octave band:
 *   A_surface = Σ Si·αi  (+ resonator Lorentzian contributions)
 *   A_air     = 4·m·V
 *   Sabine:   A = A_surface + A_air,        T60,S = 0.161·V / A
 *   Eyring:   ᾱ = A_surface / S,            T60,E = 0.161·V / (−S·ln(1−ᾱ))
 *
 * Resonator absorption is folded into A_surface before both models run, so
 * the with-resonator curves are genuinely recomputed — never patched onto
 * previously computed reverberation times.
 */
export function runCalculation(input: NormalizedRequest): CalculationResult {
  const { volume, surfaces } = input.room;
  const speedOfSound = soundSpeed(input.air.temperatureCelsius);

  const resonators = input.resonators.map((r) => evaluateResonator(r, speedOfSound));

  const totalSurfaceArea = surfaces.reduce((sum, s) => sum + s.area, 0);

  const bands: BandResult[] = OCTAVE_BANDS.map((frequency) => {
    const materialAbsorption = surfaces.reduce(
      (sum, s) => sum + s.area * s.absorption[frequency],
      0,
    );
    const resonatorAbsorption = resonators.reduce(
      (sum, r) => sum + r.bandContributions[frequency],
      0,
    );
    const airAbsorption = 4 * AIR_ATTENUATION[frequency] * volume;

    // Resonators sit on the room surfaces: their absorption is added to the
    // surface term, which both models then consume.
    const surfaceAbsorption = materialAbsorption + resonatorAbsorption;
    const totalAbsorption = surfaceAbsorption + airAbsorption;
    const meanAlpha = surfaceAbsorption / totalSurfaceArea;

    return {
      frequency,
      absorption: {
        surface: surfaceAbsorption,
        air: airAbsorption,
        resonators: resonatorAbsorption,
        total: totalAbsorption,
      },
      meanAlpha,
      sabine: sabine(volume, totalAbsorption),
      eyring: eyring(volume, totalSurfaceArea, meanAlpha),
    };
  });

  return {
    room: {
      volume,
      totalSurfaceArea,
      surfaceCount: surfaces.length,
    },
    air: {
      temperatureCelsius: input.air.temperatureCelsius,
      soundSpeed: speedOfSound,
    },
    constants: {
      sabineConstant: SABINE_CONSTANT,
      schroederConstant: SCHROEDER_CONSTANT,
      endCorrectionDelta: END_CORRECTION_DELTA,
      lorentzianHalfWidthRatio: LORENTZIAN_HALF_WIDTH_RATIO,
      airAttenuation: { ...AIR_ATTENUATION },
    },
    bands,
    resonators,
  };
}
