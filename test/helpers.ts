import { runCalculation } from '../src/acoustics/engine.js';
import { classroomPreset } from '../src/presets/classroom.js';
import type {
  BandResult,
  CalculationRequest,
  CalculationResult,
  NormalizedRequest,
} from '../src/types.js';
import { validateCalculationRequest } from '../src/validation.js';

export function classroomRequest(): CalculationRequest {
  return structuredClone(classroomPreset);
}

export function normalize(request: CalculationRequest): NormalizedRequest {
  const validation = validateCalculationRequest(request);
  if (!validation.ok) {
    throw new Error(`test payload failed validation: ${JSON.stringify(validation.errors)}`);
  }
  return validation.value;
}

export function calculate(request: CalculationRequest): CalculationResult {
  return runCalculation(normalize(request));
}

export function band(result: CalculationResult, frequency: number): BandResult {
  const found = result.bands.find((b) => b.frequency === frequency);
  if (!found) throw new Error(`band ${frequency} Hz missing from result`);
  return found;
}

/** A 500 Hz-tuned Helmholtz resonator (f0 ≈ 500.3 Hz at 20 °C). */
export const RESONATOR_500HZ = {
  name: 'helmholtz-500hz',
  neckArea: 0.007854,
  neckLength: 0.05,
  cavityVolume: 0.000694,
  count: 100,
};
