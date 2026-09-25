import { SABINE_CONSTANT, SCHROEDER_CONSTANT } from '../constants.js';
import type { DerivedQuantities } from '../types.js';

/**
 * Upper clamp for the Eyring mean absorption coefficient. ᾱ = 1 would make
 * ln(1 − ᾱ) singular; physically a room always keeps a sliver of reflection.
 */
const ALPHA_BAR_MAX = 1 - 1e-12;

/**
 * Critical distance for a diffuse field and an omnidirectional source:
 * dc = √(A_eff / 16π). Since A_eff = SABINE_CONSTANT·V/T60 this is exactly
 * dc ≈ 0.057·√(V/T60) — the proportionality required by the spec.
 */
function criticalDistance(effectiveAbsorption: number): number {
  return Math.sqrt(effectiveAbsorption / (16 * Math.PI));
}

/**
 * Schroeder frequency f_s = 2000·√(T60/V). The T60 passed in must be the one
 * just computed by the caller for this band and model — never a constant.
 */
function schroederFrequency(t60: number, volume: number): number {
  return SCHROEDER_CONSTANT * Math.sqrt(t60 / volume);
}

function derive(t60: number, effectiveAbsorption: number, volume: number): DerivedQuantities {
  return {
    t60,
    criticalDistance: criticalDistance(effectiveAbsorption),
    schroederFrequency: schroederFrequency(t60, volume),
  };
}

const NO_ABSORPTION: DerivedQuantities = {
  t60: null,
  criticalDistance: null,
  schroederFrequency: null,
};

/**
 * Sabine model.
 *
 *   A        = Σ Si·αi + A_resonators + 4·m·V   (total absorption, m²)
 *   T60,S    = SABINE_CONSTANT · V / A
 *
 * @param volume           room volume V (m³), must be > 0
 * @param totalAbsorption  total equivalent absorption area A (m²)
 */
export function sabine(volume: number, totalAbsorption: number): DerivedQuantities {
  if (totalAbsorption <= 0) return NO_ABSORPTION;
  const t60 = (SABINE_CONSTANT * volume) / totalAbsorption;
  return derive(t60, totalAbsorption, volume);
}

/**
 * Eyring model.
 *
 *   ᾱ        = A_surface / S                    (mean absorption coefficient)
 *   T60,E    = SABINE_CONSTANT · V / (−S·ln(1 − ᾱ))
 *
 * The minus sign in the denominator is essential: ln(1 − ᾱ) < 0, so the
 * denominator is positive and −S·ln(1−ᾱ) ≥ S·ᾱ. Writing +S·ln(1−ᾱ) instead
 * would make T60 negative and make the two models diverge in opposite
 * directions for absorbent rooms — the classic bug this module is built
 * to prevent.
 *
 * @param volume            room volume V (m³), must be > 0
 * @param totalSurfaceArea  S = Σ Si (m²), must be > 0
 * @param meanAlpha         ᾱ including resonator absorption (dimensionless)
 */
export function eyring(
  volume: number,
  totalSurfaceArea: number,
  meanAlpha: number,
): DerivedQuantities {
  const alphaBar = Math.min(Math.max(meanAlpha, 0), ALPHA_BAR_MAX);
  const equivalentAbsorption = -totalSurfaceArea * Math.log(1 - alphaBar);
  if (equivalentAbsorption <= 0) return NO_ABSORPTION;
  const t60 = (SABINE_CONSTANT * volume) / equivalentAbsorption;
  return derive(t60, equivalentAbsorption, volume);
}
