import type { OctaveBand } from './constants.js';

/* ---------- Incoming API payloads (untrusted) ---------- */

export interface SurfaceInput {
  name?: string;
  area: number;
  /** Absorption coefficients keyed by octave-band centre frequency, e.g. "125". */
  absorption: Record<string, number>;
}

export interface ResonatorInput {
  name?: string;
  /** Neck cross-section area S_n (m²). */
  neckArea: number;
  /** Neck length L (m). */
  neckLength: number;
  /** Cavity volume V_c (m³). */
  cavityVolume: number;
  /** Number of identical units. Defaults to 1. */
  count?: number;
  /** Optional override for the peak absorption area per unit (m²). */
  peakAbsorptionArea?: number;
}

export interface AirInput {
  temperatureCelsius?: number;
}

export interface CalculationRequest {
  name?: string;
  room: {
    volume: number;
    surfaces: SurfaceInput[];
  };
  air?: AirInput;
  resonators?: ResonatorInput[];
}

/* ---------- Validated / normalized domain model ---------- */

export interface NormalizedSurface {
  name: string;
  area: number;
  absorption: Record<OctaveBand, number>;
}

export interface NormalizedResonator {
  name: string;
  neckArea: number;
  neckLength: number;
  cavityVolume: number;
  count: number;
  peakAbsorptionArea?: number;
}

export interface NormalizedRequest {
  name: string;
  room: {
    volume: number;
    surfaces: NormalizedSurface[];
  };
  air: {
    temperatureCelsius: number;
  };
  resonators: NormalizedResonator[];
}

/* ---------- Validation ---------- */

export interface FieldError {
  field: string;
  reason: string;
}

export type ValidationResult =
  | { ok: true; value: NormalizedRequest }
  | { ok: false; errors: FieldError[] };

/* ---------- Calculation results ---------- */

/** Per-band quantities derived from a reverberation time. */
export interface DerivedQuantities {
  /** s — null means "no absorption at all, reverberation is infinite". */
  t60: number | null;
  /** m — critical distance, dc ∝ √(V/T60). */
  criticalDistance: number | null;
  /** Hz — Schroeder frequency, f_s = 2000·√(T60/V) with this band's T60. */
  schroederFrequency: number | null;
}

export interface BandAbsorptionBreakdown {
  /** Σ Si·αi (m²) */
  surface: number;
  /** 4·m·V (m²) */
  air: number;
  /** Lorentzian contributions of all resonators (m²) */
  resonators: number;
  /** surface + air + resonators (m²) */
  total: number;
}

export interface BandResult {
  frequency: OctaveBand;
  absorption: BandAbsorptionBreakdown;
  /** ᾱ = (surface + resonators) / S — the Eyring mean absorption coefficient. */
  meanAlpha: number;
  sabine: DerivedQuantities;
  eyring: DerivedQuantities;
}

export interface ResonatorResult {
  name: string;
  neckArea: number;
  neckLength: number;
  cavityVolume: number;
  count: number;
  /** L_eff = L + δ·√(S_n/π) (m) */
  effectiveNeckLength: number;
  /** f0 = (c/2π)·√(S_n/(V_c·L_eff)) (Hz) */
  resonanceFrequency: number;
  /** Sound speed used (m/s) — consistent with the request temperature. */
  soundSpeed: number;
  /** c / f0 (m) */
  wavelength: number;
  /** Peak absorption area of a single unit at f0 (m²). */
  peakAbsorptionAreaPerUnit: number;
  /** Octave band whose centre is closest to f0. */
  targetBand: OctaveBand;
  /** Total (all units) Lorentzian absorption contributed per band (m²). */
  bandContributions: Record<OctaveBand, number>;
}

export interface CalculationResult {
  room: {
    volume: number;
    totalSurfaceArea: number;
    surfaceCount: number;
  };
  air: {
    temperatureCelsius: number;
    soundSpeed: number;
  };
  constants: {
    sabineConstant: number;
    schroederConstant: number;
    endCorrectionDelta: number;
    lorentzianHalfWidthRatio: number;
    airAttenuation: Record<OctaveBand, number>;
  };
  bands: BandResult[];
  resonators: ResonatorResult[];
}

/* ---------- Persistence ---------- */

export interface CalculationRecord {
  id: string;
  name: string;
  createdAt: string;
  request: NormalizedRequest;
  result: CalculationResult;
}

export interface CalculationSummary {
  id: string;
  name: string;
  createdAt: string;
}
