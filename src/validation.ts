import {
  DEFAULT_TEMPERATURE_CELSIUS,
  OCTAVE_BANDS,
  type OctaveBand,
} from './constants.js';
import type {
  FieldError,
  NormalizedRequest,
  NormalizedResonator,
  NormalizedSurface,
  ValidationResult,
} from './types.js';

const BAND_KEYS = new Set(OCTAVE_BANDS.map((b) => String(b)));

const MIN_TEMPERATURE_C = -40;
const MAX_TEMPERATURE_C = 60;
const MAX_NAME_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateAbsorption(
  raw: unknown,
  field: string,
  errors: FieldError[],
): Record<OctaveBand, number> | null {
  if (!isRecord(raw)) {
    errors.push({ field, reason: 'must be an object keyed by octave-band centre frequency' });
    return null;
  }
  for (const key of Object.keys(raw)) {
    if (!BAND_KEYS.has(key)) {
      errors.push({
        field: `${field}.${key}`,
        reason: `unknown octave band "${key}"; allowed bands: ${[...BAND_KEYS].join(', ')}`,
      });
    }
  }
  const absorption = {} as Record<OctaveBand, number>;
  let valid = true;
  for (const band of OCTAVE_BANDS) {
    const key = String(band);
    const alpha = raw[key];
    if (!isFiniteNumber(alpha)) {
      errors.push({ field: `${field}.${key}`, reason: 'absorption coefficient is required and must be a finite number' });
      valid = false;
      continue;
    }
    if (alpha < 0 || alpha > 1) {
      errors.push({ field: `${field}.${key}`, reason: `absorption coefficient must be within [0, 1], got ${alpha}` });
      valid = false;
      continue;
    }
    absorption[band] = alpha;
  }
  return valid ? absorption : null;
}

function validateSurfaces(
  raw: unknown,
  errors: FieldError[],
): NormalizedSurface[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    errors.push({ field: 'room.surfaces', reason: 'must be a non-empty array of surfaces' });
    return [];
  }
  const surfaces: NormalizedSurface[] = [];
  raw.forEach((entry, i) => {
    const field = `room.surfaces[${i}]`;
    if (!isRecord(entry)) {
      errors.push({ field, reason: 'must be an object' });
      return;
    }
    if (entry.name !== undefined && typeof entry.name !== 'string') {
      errors.push({ field: `${field}.name`, reason: 'must be a string' });
    }
    if (!isFiniteNumber(entry.area) || entry.area <= 0) {
      errors.push({
        field: `${field}.area`,
        reason: `surface area must be a positive finite number, got ${JSON.stringify(entry.area)}`,
      });
    }
    const absorption = validateAbsorption(entry.absorption, `${field}.absorption`, errors);
    if (isFiniteNumber(entry.area) && entry.area > 0 && absorption) {
      surfaces.push({
        name: typeof entry.name === 'string' ? entry.name : `surface-${i}`,
        area: entry.area,
        absorption,
      });
    }
  });
  return surfaces;
}

function validateResonators(
  raw: unknown,
  errors: FieldError[],
): NormalizedResonator[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push({ field: 'resonators', reason: 'must be an array of Helmholtz resonators' });
    return [];
  }
  const resonators: NormalizedResonator[] = [];
  raw.forEach((entry, i) => {
    const field = `resonators[${i}]`;
    if (!isRecord(entry)) {
      errors.push({ field, reason: 'must be an object' });
      return;
    }
    let valid = true;
    const positiveField = (value: unknown, name: string): value is number => {
      if (!isFiniteNumber(value) || value <= 0) {
        errors.push({
          field: `${field}.${name}`,
          reason: `must be a positive finite number, got ${JSON.stringify(value)}`,
        });
        valid = false;
        return false;
      }
      return true;
    };
    positiveField(entry.neckArea, 'neckArea');
    positiveField(entry.neckLength, 'neckLength');
    positiveField(entry.cavityVolume, 'cavityVolume');

    let count = 1;
    if (entry.count !== undefined) {
      if (!Number.isInteger(entry.count) || (entry.count as number) < 1) {
        errors.push({ field: `${field}.count`, reason: 'must be a positive integer' });
        valid = false;
      } else {
        count = entry.count as number;
      }
    }
    let peakAbsorptionArea: number | undefined;
    if (entry.peakAbsorptionArea !== undefined) {
      if (!isFiniteNumber(entry.peakAbsorptionArea) || entry.peakAbsorptionArea <= 0) {
        errors.push({ field: `${field}.peakAbsorptionArea`, reason: 'must be a positive finite number' });
        valid = false;
      } else {
        peakAbsorptionArea = entry.peakAbsorptionArea;
      }
    }
    if (entry.name !== undefined && typeof entry.name !== 'string') {
      errors.push({ field: `${field}.name`, reason: 'must be a string' });
      valid = false;
    }
    if (valid) {
      resonators.push({
        name: typeof entry.name === 'string' ? entry.name : `resonator-${i}`,
        neckArea: entry.neckArea as number,
        neckLength: entry.neckLength as number,
        cavityVolume: entry.cavityVolume as number,
        count,
        peakAbsorptionArea,
      });
    }
  });
  return resonators;
}

/**
 * Validates an untrusted request body and normalizes it into the domain
 * model. Every violation is reported with its field path and a reason; all
 * errors are collected instead of failing on the first one.
 */
export function validateCalculationRequest(raw: unknown): ValidationResult {
  const errors: FieldError[] = [];

  if (!isRecord(raw)) {
    return {
      ok: false,
      errors: [{ field: 'body', reason: 'request body must be a JSON object' }],
    };
  }

  let name = 'unnamed-room';
  if (raw.name !== undefined) {
    if (typeof raw.name !== 'string' || raw.name.length === 0 || raw.name.length > MAX_NAME_LENGTH) {
      errors.push({ field: 'name', reason: `must be a string of 1..${MAX_NAME_LENGTH} characters` });
    } else {
      name = raw.name;
    }
  }

  if (!isRecord(raw.room)) {
    errors.push({ field: 'room', reason: 'must be an object with volume and surfaces' });
    return { ok: false, errors };
  }

  let volume = 0;
  if (!isFiniteNumber(raw.room.volume) || raw.room.volume <= 0) {
    errors.push({
      field: 'room.volume',
      reason: `room volume must be a positive finite number, got ${JSON.stringify(raw.room.volume)}`,
    });
  } else {
    volume = raw.room.volume;
  }

  const surfaces = validateSurfaces(raw.room.surfaces, errors);

  let temperatureCelsius = DEFAULT_TEMPERATURE_CELSIUS;
  if (raw.air !== undefined) {
    if (!isRecord(raw.air)) {
      errors.push({ field: 'air', reason: 'must be an object' });
    } else if (raw.air.temperatureCelsius !== undefined) {
      const t = raw.air.temperatureCelsius;
      if (!isFiniteNumber(t) || t < MIN_TEMPERATURE_C || t > MAX_TEMPERATURE_C) {
        errors.push({
          field: 'air.temperatureCelsius',
          reason: `must be a finite number within [${MIN_TEMPERATURE_C}, ${MAX_TEMPERATURE_C}] °C`,
        });
      } else {
        temperatureCelsius = t;
      }
    }
  }

  const resonators = validateResonators(raw.resonators, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      name,
      room: { volume, surfaces },
      air: { temperatureCelsius },
      resonators,
    },
  };
}
