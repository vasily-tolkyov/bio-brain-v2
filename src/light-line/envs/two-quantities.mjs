/** Independent second adapter: unrelated names, ranges, setpoints and effects. */
export const TWO_DECLARATIONS = Object.freeze([
  Object.freeze({ name: 'pressure', min: -10, max: 10, setpoint: 0, bins: 4 }),
  Object.freeze({ name: 'charge', min: 0, max: 200, setpoint: 150, bins: 5 }),
]);
const SOURCE_LABELS = Object.freeze({ marker: 'visual:marker-position',
  'action:pump': 'motor:pump', 'action:connect': 'motor:connect' });
export function twoQuantities() {
  let pressure = -8, charge = 30;
  return { features: ['marker'], actions: ['pump', 'connect'], interoception: TWO_DECLARATIONS,
    sourceLabels: SOURCE_LABELS,
    step(ms, action = null) {
      if (!Number.isFinite(ms) || ms <= 0 || ms % 0.5 ||
          ![null, 'pump', 'connect'].includes(action)) throw new Error('Invalid second adapter step');
      if (action === 'pump') pressure = Math.min(10, pressure + 5);
      if (action === 'connect') charge = Math.min(200, charge + 40);
      const reading = { features: {}, interoception: { pressure, charge } };
      pressure = Math.max(-10, pressure - 0.00002 * ms);
      charge = Math.max(0, charge - 0.0002 * ms);
      return reading;
    },
  };
}
