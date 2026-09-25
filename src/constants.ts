/**
 * Shared physical constants for the room-acoustics engine.
 *
 * Both reverberation models (Sabine and Eyring) and the Helmholtz resonator
 * module import their constants from here. Each constant exists exactly once
 * so the models can never drift apart into diverging implementations.
 */

/** Octave-band centre frequencies (Hz). Fixed by design: 125 Hz – 4 kHz. */
export const OCTAVE_BANDS = [125, 250, 500, 1000, 2000, 4000] as const;
export type OctaveBand = (typeof OCTAVE_BANDS)[number];

/**
 * Sabine/Eyring proportionality constant (s/m, metric).
 * T60 = SABINE_CONSTANT · V / A. The value 0.161 is consistent with a sound
 * speed of ~343 m/s, i.e. air at 20 °C — the same reference the resonator
 * module uses via `soundSpeed(DEFAULT_TEMPERATURE_CELSIUS)`.
 */
export const SABINE_CONSTANT = 0.161;

/** Default air temperature used when a request does not specify one. */
export const DEFAULT_TEMPERATURE_CELSIUS = 20;

/**
 * Air attenuation coefficient m (1/m) per octave band, used in the 4·m·V
 * term of the Sabine absorption. Fixed choice for the whole service:
 * representative values for 20 °C / 70 % relative humidity, rounded.
 */
export const AIR_ATTENUATION: Record<OctaveBand, number> = {
  125: 0,
  250: 0,
  500: 0,
  1000: 0.002,
  2000: 0.004,
  4000: 0.009,
};

/**
 * End-correction factor δ for the Helmholtz resonator neck:
 * L_eff = L + δ·√(S_n/π). Fixed at 1.7 (both ends of the neck corrected).
 */
export const END_CORRECTION_DELTA = 1.7;

/**
 * Half-width at half-maximum of the Lorentzian absorption profile of a
 * resonator, expressed as a fraction of its resonance frequency:
 * γ = LORENTZIAN_HALF_WIDTH_RATIO · f0. Fixed for the whole service.
 */
export const LORENTZIAN_HALF_WIDTH_RATIO = 0.1;

/** Schroeder-frequency proportionality: f_s = SCHROEDER_CONSTANT · √(T60/V). */
export const SCHROEDER_CONSTANT = 2000;

/**
 * Speed of sound in air as a function of temperature:
 * c = 331.3 · √(1 + T/273.15) m/s. At 20 °C this gives ≈ 343.2 m/s.
 * The resonator's sound speed, wavelength and f0 all derive from this single
 * function so they are always temperature-consistent.
 */
export function soundSpeed(temperatureCelsius: number): number {
  return 331.3 * Math.sqrt(1 + temperatureCelsius / 273.15);
}
