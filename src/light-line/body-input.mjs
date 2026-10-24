import { ObservedStream } from './observed-stream.mjs';
import { bodyVariables, bodyReading } from './interoception.mjs';
import { BodyChanges } from './body-changes.mjs';
import { present } from './presence.mjs';

/** Raw readings only encode sensor ports. Bin/change evidence downstream is
 * the measured optical P7, never the arithmetic bin selected by the adapter. */
export class BodyInput {
  constructor(declarations, seed, streams = null) {
    this.variables = bodyVariables(declarations);
    this.streams = streams ?? this.variables.map(v => new ObservedStream(v.ids, seed));
    this.changes = new BodyChanges(this.variables); this.readings = null;
  }
  window(segments, t) {
    const encoded = segments.map(s => ({ bars: bodyReading(this.variables, s.readings), durationMs: s.durationMs }));
    const optical = this.variables.map((v, i) => {
      const parts = [];
      for (const s of encoded) {
        const bin = s.bars[i].bin;
        if (parts.at(-1)?.bin === bin) parts.at(-1).durationMs += s.durationMs;
        else parts.push({ bin, values: v.ids.map((_, b) => Number(b === bin)), durationMs: s.durationMs });
      }
      return this.streams[i].window(parts.map(({ values, durationMs }) => ({ values, durationMs })));
    });
    const bins = optical.flatMap(o => o.readout).filter(r => present(r.strength));
    const changes = this.changes.update(t, bins);
    this.readings = { ...segments.at(-1).readings };
    return { optical, bins, changes, observations: [...bins, ...changes] };
  }
}
