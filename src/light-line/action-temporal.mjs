import { TimeUnroll } from './unroll.mjs';
import { VisualAttractorLayer } from './visual-layer.mjs';
import { ROLE_CONTINUOUS } from './role-config.mjs';
import { present } from './presence.mjs';

/** L3b's distinct physical visual ports, extended to the concatenated IO map.
 * One cell per (observed ID, copy); one N=250 higher base; all nine copies.
 * Reject capacity instead of wrapping/sharding the spatial map. */
export class ActionTemporal {
  constructor(ids, seed) {
    if (ids.length * 9 > 250) throw new RangeError('Temporal IO capacity exceeds N=250');
    this.past = new TimeUnroll(ids); this.last = null;
    this.layer = new VisualAttractorLayer({ seed, pixels: ids.length * 9, level: 2, continuous: ROLE_CONTINUOUS });
  }
  /** Independent episode clock over the same frozen, learned optical base.
   * This is a read-only observation view, not a persistence/continuation API. */
  frozenView() {
    if (!this.layer.frozen) throw new Error('Observation views require frozen temporal optics');
    const view = Object.create(ActionTemporal.prototype);
    view.past = new TimeUnroll(this.past.ids); view.layer = this.layer; view.last = null;
    return view;
  }
  observe(t, observations) {
    this.past.update(t, observations.filter(e => present(e.strength)));
    const onsets = this.past.entries.filter(e => e.tOnset === t);
    const lines = Array.from(this.past.lines(t));
    const learned = onsets.length > 0 && !this.layer.frozen;
    if (learned) this.layer.present(lines, .5);
    const fields = this.layer.query(lines).carrierFields;
    this.last = { t, lines, onsets: structuredClone(onsets), fields, learned };
    return this.last;
  }
}
