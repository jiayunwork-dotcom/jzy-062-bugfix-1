import type { CalculationRequest } from '../types.js';

/**
 * Preset classroom-scale example (9.0 m × 7.0 m × 3.2 m, V = 201.6 m³).
 *
 * Materials (octave-band absorption coefficients, 125 Hz – 4 kHz):
 *  - floor:   carpet on concrete, 63 m²
 *  - ceiling: acoustic tile, 63 m²
 *  - walls:   gypsum plaster on masonry, 102.4 m²
 *
 * Mid-frequency Sabine T60 lands around 0.4–0.6 s, a plausible range for a
 * furnished classroom; every band stays positive.
 */
export const classroomPreset: CalculationRequest = {
  name: 'classroom-preset',
  room: {
    volume: 201.6,
    surfaces: [
      {
        name: 'floor-carpet-on-concrete',
        area: 63,
        absorption: { '125': 0.03, '250': 0.06, '500': 0.15, '1000': 0.3, '2000': 0.4, '4000': 0.45 },
      },
      {
        name: 'ceiling-acoustic-tile',
        area: 63,
        absorption: { '125': 0.3, '250': 0.55, '500': 0.75, '1000': 0.85, '2000': 0.8, '4000': 0.75 },
      },
      {
        name: 'walls-gypsum-plaster',
        area: 102.4,
        absorption: { '125': 0.15, '250': 0.1, '500': 0.06, '1000': 0.04, '2000': 0.04, '4000': 0.03 },
      },
    ],
  },
  air: { temperatureCelsius: 20 },
  resonators: [],
};

/**
 * Example Helmholtz resonator tuned to the 500 Hz octave band at 20 °C
 * (f0 ≈ 500 Hz): neck radius 5 cm, neck length 5 cm, cavity ≈ 0.69 L,
 * deployed as an array of 100 units. Used by the tests and documented in
 * the README as a ready-made payload fragment.
 */
export const classroomResonator500 = {
  name: 'helmholtz-500hz',
  neckArea: 0.007854,
  neckLength: 0.05,
  cavityVolume: 0.000694,
  count: 100,
};
