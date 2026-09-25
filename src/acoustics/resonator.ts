import {
  END_CORRECTION_DELTA,
  LORENTZIAN_HALF_WIDTH_RATIO,
  OCTAVE_BANDS,
  type OctaveBand,
} from '../constants.js';
import type { NormalizedResonator, ResonatorResult } from '../types.js';

/**
 * Evaluates a Helmholtz resonator at the given sound speed.
 *
 *   L_eff = L + δ·√(S_n/π)          (δ fixed in constants.ts)
 *   f0    = (c / 2π)·√(S_n / (V_c·L_eff))
 *
 * The resonator contributes a narrowband Lorentzian absorption to every
 * octave band:
 *
 *   A_r(f) = count · A_peak · γ² / ((f − f0)² + γ²),   γ = 0.1·f0
 *
 * so the contribution peaks at the band containing f0 and falls off sharply
 * towards neighbouring bands. A_peak defaults to λ0²/2π (the absorption
 * cross-section of a matched resonant absorber) and can be overridden per
 * resonator.
 *
 * @param resonator  validated resonator geometry
 * @param speedOfSound  c (m/s) — must come from `soundSpeed(temperature)` so
 *                      that c, wavelength and f0 are temperature-consistent
 */
export function evaluateResonator(
  resonator: NormalizedResonator,
  speedOfSound: number,
): ResonatorResult {
  const { neckArea, neckLength, cavityVolume, count } = resonator;

  const effectiveNeckLength =
    neckLength + END_CORRECTION_DELTA * Math.sqrt(neckArea / Math.PI);

  const resonanceFrequency =
    (speedOfSound / (2 * Math.PI)) *
    Math.sqrt(neckArea / (cavityVolume * effectiveNeckLength));

  const wavelength = speedOfSound / resonanceFrequency;

  const peakAbsorptionAreaPerUnit =
    resonator.peakAbsorptionArea ?? (wavelength * wavelength) / (2 * Math.PI);

  const gamma = resonanceFrequency * LORENTZIAN_HALF_WIDTH_RATIO;
  const gammaSquared = gamma * gamma;

  const bandContributions = {} as Record<OctaveBand, number>;
  let targetBand: OctaveBand = OCTAVE_BANDS[0];
  let maxContribution = -1;
  for (const band of OCTAVE_BANDS) {
    const detuning = band - resonanceFrequency;
    const contribution =
      (count * peakAbsorptionAreaPerUnit * gammaSquared) /
      (detuning * detuning + gammaSquared);
    bandContributions[band] = contribution;
    if (contribution > maxContribution) {
      maxContribution = contribution;
      targetBand = band;
    }
  }

  return {
    name: resonator.name,
    neckArea,
    neckLength,
    cavityVolume,
    count,
    effectiveNeckLength,
    resonanceFrequency,
    soundSpeed: speedOfSound,
    wavelength,
    peakAbsorptionAreaPerUnit,
    targetBand,
    bandContributions,
  };
}
