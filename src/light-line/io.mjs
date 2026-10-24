import { SensoryRole, MotorRole, BodyRole } from './roles.mjs';

/** Input-only L2 stack. Actions are supplied observations; no policy or feedback
 * loop runs here. An environment may supply the same sample via sample(). */
export class LightRoleStack {
  constructor(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)
        || Object.keys(options).some(k => !['seed', 'continuous', 'features', 'actions', 'quantities'].includes(k))) {
      throw new TypeError('Unknown stack options');
    }
    const { seed = 7, continuous, features, actions, quantities } = options;
    Object.defineProperties(this, {
      sensory: { value: new SensoryRole({ seed, continuous, features }), enumerable: true },
      motor: { value: new MotorRole({ seed, continuous, actions }), enumerable: true },
      body: { value: new BodyRole({ seed, continuous, quantities }), enumerable: true },
    });
  }
  get layers() {
    return [{ role: 'sensory', key: 'sensory', layer: this.sensory.layer },
      { role: 'motor', key: 'motor', layer: this.motor.layer },
      ...this.body.layers.map(({ quantity, layer }) => ({ role: 'body', key: `body:${quantity}`, layer }))];
  }
  present(sample = {}, durationMs = .5) {
    if (!sample || typeof sample !== 'object' || Array.isArray(sample)
        || Object.keys(sample).some(k => !['features', 'actions', 'body'].includes(k))) throw new TypeError('Expected feature/action/body sample');
    if (!Number.isSafeInteger(durationMs / .5) || durationMs < 0) throw new RangeError('Duration must use .5 ms ticks');
    const sensory = this.sensory.vector(sample.features), motor = this.motor.vector(sample.actions);
    const body = this.body.vectors(sample.body);
    for (const { layer } of this.layers) {
      if (!Number.isSafeInteger((layer.clock + durationMs) / .5)) throw new RangeError('Clock overflow');
    }
    return { sensory: this.sensory.layer.present(sensory, durationMs),
      motor: this.motor.layer.present(motor, durationMs),
      body: this.body.layers.map(({ layer }, i) => layer.present(body[i], durationMs)) };
  }
  step(source, durationMs = .5) {
    return this.present(typeof source?.sample === 'function' ? source.sample() : source, durationMs);
  }
  freeze(value = true) { this.layers.forEach(({ layer }) => layer.freeze(value)); return this; }
}
