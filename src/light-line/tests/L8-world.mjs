import { ContinuationWorld } from './L7-world.mjs';
/** External physical interventions, with no reset of time, queues or history.
 * The environment never sees goals, memberships, predictions or weights. */
export class AcceptanceWorld extends ContinuationWorld {
  constructor(seed, schedule, reward = 'off') {
    super(seed, { initial: schedule.episodes[0].initial });
    this.schedule = schedule; this.rewardMode = reward;
    this.descriptor = { ...this.descriptor, id: 'L8-natural-continuous-world-v1', schedule, reward };
  }
  step(ms, action = null) {
    const t = this.state.t, e = this.schedule.episodes.find(e => e.start === t);
    if (e) this.state.energy = e.initial;
    if (t === this.schedule.episodes.length * 20000) this.state.energy = 70;
    const sample = super.step(ms, action);
    return { ...sample, reward: this.rewardMode === 'positive' ? 17 : this.rewardMode === 'negative' ? -23 :
      this.rewardMode === 'on' ? Math.sin(t / 777) : 0 };
  }
}
