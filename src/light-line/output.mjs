import { ObservedStream } from './observed-stream.mjs';
export const OUTPUT = Object.freeze({ thetaExec: .75 });
export const actionId = name => `action:${name}`;

export function motorWinner(readout, actions) {
  let winner = { action: null, strength: 0 };
  for (const action of actions) {
    const strength = readout.find(r => r.id === action)?.strength ?? 0;
    if (strength > winner.strength) winner = { action, strength };
  }
  return { ...winner, action: winner.strength >= OUTPUT.thetaExec ? winner.action : null };
}

export class OutputLayer {
  constructor(actions, seed, stream = new ObservedStream(actions, seed)) {
    this.actions = [...actions]; this.stream = stream; this.previous = null;
  }
  step(drive = new Float64Array(this.actions.length)) {
    if (drive.length !== this.actions.length || !Array.from(drive).every(s => Number.isFinite(s) && s >= 0 && s <= 1)) {
      throw new Error('Invalid motor drive');
    }
    const optical = this.stream.window([{ values: Array.from(drive), durationMs: 100 }]);
    const winner = motorWinner(optical.readout, this.actions);
    const action = winner.action === this.previous ? null : winner.action;
    this.previous = winner.action;
    return { action, strength: winner.strength, winner: winner.action, optical };
  }
}
