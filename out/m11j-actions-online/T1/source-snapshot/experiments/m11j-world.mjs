/** Experiment-only persistent action world. Schedules are fixed before training;
 * this module has no neural access and never chooses or injects an action. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeRng } from '../src/core/rng.mjs';
import { ACTION_WORLD, CHAIN_WORLD, FEATURES, ACTIONS } from '../src/envs/actions.mjs';

const SLOT_MS = 10000, DT_MS = 0.5;
const PHASE_COUNTS = Object.freeze({
  normal: { light: 6, bell: 6, none: 6, bird: 6 },
  broken: { light: 6, bell: 6, none: 4, bird: 4 },
  restored: { light: 6, bell: 6, none: 6, bird: 6 },
});
const tick = t => Number.isFinite(t) && t >= 0 && Number.isSafeInteger(t / DT_MS);
const clone = value => structuredClone(value);
const signature = schedule => createHash('sha256').update(JSON.stringify(schedule)).digest('hex');

/** Independent Fisher-Yates streams for the three orders, plus an independent
 * bird stream. Rounding a uniform continuous 0..8000 ms draw to the 0.5 ms grid
 * preserves possible endpoints, cooccurrences, and every predeclared slot. */
export function planSchedule(start, environmentSeed) {
  assert.ok(tick(start) && tick(start + 68 * SLOT_MS), 'Invalid schedule start');
  assert.ok(Number.isSafeInteger(environmentSeed) && environmentSeed >= 0 &&
    environmentSeed <= 0xffffffff, 'Invalid environment seed');
  const streams = { normal: (environmentSeed + 110000) >>> 0,
    broken: (environmentSeed + 120000) >>> 0, restored: (environmentSeed + 130000) >>> 0,
    bird: (environmentSeed + 140000) >>> 0 };
  const bird = makeRng(streams.bird), slots = [], events = [];
  for (const [phase, counts] of Object.entries(PHASE_COUNTS)) {
    const kinds = Object.entries(counts).flatMap(([kind, count]) => Array(count).fill(kind));
    makeRng(streams[phase]).shuffle(kinds);
    for (const [within, kind] of kinds.entries()) {
      const index = slots.length, at = start + index * SLOT_MS;
      const event = { id: events.length + 1, g: 'bird',
        start: at + Math.round(bird.uniform() * 8000 / DT_MS) * DT_MS,
        duration: ACTION_WORLD.durationMs, causeExecutionId: null };
      events.push(event);
      slots.push({ phase, kind, start: at, end: at + SLOT_MS, index,
        within: within + 1, events: [clone(event)] });
    }
  }
  return { schema: 'm11j-action-schedule-v1', environmentSeed, streams,
    start, end: start + slots.length * SLOT_MS, duration: slots.length * SLOT_MS,
    slots, events };
}

/** step samples physical inputs at its pre-step time, like actionsEnv/chainEnv,
 * then advances by half-ms ticks. An action executes exactly once at that sample
 * time. Events use half-open [start, start + duration) intervals. All records,
 * including expired and not-yet-arrived events, remain in the audit log. */
export class PersistentActionWorld {
  constructor(schedule, state = null) {
    assert.equal(schedule?.schema, 'm11j-action-schedule-v1');
    assert.ok(tick(schedule.start) && tick(schedule.end));
    assert.equal(schedule.slots.length, 68);
    assert.equal(schedule.end - schedule.start, 68 * SLOT_MS);
    assert.equal(schedule.duration, 68 * SLOT_MS);
    assert.equal(schedule.events.length, 68);
    let index = 0;
    for (const [phase, counts] of Object.entries(PHASE_COUNTS)) {
      const actual = Object.fromEntries(Object.keys(counts).map(kind => [kind, 0]));
      for (let within = 1; within <= Object.values(counts).reduce((a, b) => a + b, 0); within++) {
        const slot = schedule.slots[index], event = schedule.events[index];
        assert.equal(slot.index, index); assert.equal(slot.phase, phase);
        assert.equal(slot.within, within); assert.ok(Object.hasOwn(actual, slot.kind));
        actual[slot.kind]++;
        assert.equal(slot.start, schedule.start + index * SLOT_MS);
        assert.equal(slot.end, slot.start + SLOT_MS);
        assert.equal(event.id, index + 1); assert.equal(event.g, 'bird');
        assert.equal(event.duration, ACTION_WORLD.durationMs);
        assert.equal(event.causeExecutionId, null);
        assert.ok(tick(event.start) && event.start >= slot.start && event.start <= slot.start + 8000);
        assert.deepEqual(slot.events, [event]);
        index++;
      }
      assert.deepEqual(actual, counts);
    }
    this.schedule = clone(schedule);
    this.scheduleSHA256 = signature(schedule);
    this.features = FEATURES; this.actions = ACTIONS;
    this.duration = schedule.duration;
    this.time = schedule.start;
    this.events = clone(schedule.events); this.executed = [];
    this.pending = [...this.events];
    this.nextEventId = this.events.length + 1; this.nextExecutionId = 1;
    if (state !== null) {
      assert.equal(state.schema, 'm11j-action-world-state-v1');
      assert.equal(state.scheduleSHA256, this.scheduleSHA256, 'World schedule changed on restore');
      assert.ok(tick(state.time) && state.time >= schedule.start, 'Invalid world time');
      assert.ok(Array.isArray(state.events) && Array.isArray(state.executed) && Array.isArray(state.pending));
      this.time = state.time; this.events = clone(state.events); this.executed = clone(state.executed);
      this.nextEventId = state.nextEventId; this.nextExecutionId = state.nextExecutionId;
      assert.deepEqual(this.events.slice(0, 68), schedule.events);
      assert.equal(this.nextEventId, this.events.length + 1);
      assert.equal(this.nextExecutionId, this.executed.length + 1);
      this.events.forEach((e, i) => assert.equal(e.id, i + 1));
      this.executed.forEach((e, i) => assert.equal(e.id, i + 1));
      const byId = new Map(this.events.map(e => [e.id, e]));
      this.pending = state.pending.map(id => {
        assert.ok(byId.has(id), 'Unknown pending event'); return byId.get(id);
      });
      assert.deepEqual(state.pending, this.events.filter(e => e.start + e.duration > this.time).map(e => e.id));
      assert.deepEqual(this.saveState(), state, 'World snapshot round trip differs');
    }
  }

  step(ms, action = null) {
    assert.ok(tick(ms) && ms > 0 && tick(this.time + ms), 'Invalid action step duration');
    assert.ok(action === null || ACTIONS.includes(action), 'Unknown action');
    if (action !== null) {
      const slot = this.schedule.slots[Math.floor((this.time - this.schedule.start) / SLOT_MS)];
      assert.ok(slot && this.time >= slot.start && this.time < slot.end, 'Action outside schedule');
      const execution = { id: this.nextExecutionId++, action, t: this.time,
        phase: slot.phase, slotIndex: slot.index };
      this.executed.push(execution);
      if (action === 'press' && slot.phase !== 'broken') {
        for (const [g, delay] of [['light', ACTION_WORLD.pressDelayMs],
          ['bell', ACTION_WORLD.pressDelayMs + CHAIN_WORLD.bellDelayMs]]) {
          const event = { id: this.nextEventId++, g, start: this.time + delay,
            duration: ACTION_WORLD.durationMs, causeExecutionId: execution.id };
          this.events.push(event); this.pending.push(event);
        }
      }
    }
    const features = Object.fromEntries(FEATURES.map(g => [g, Number(this.pending.some(e =>
      e.g === g && this.time >= e.start && this.time < e.start + e.duration))]));
    for (let elapsed = 0; elapsed < ms; elapsed += DT_MS) this.time += DT_MS;
    this.pending = this.pending.filter(e => this.time < e.start + e.duration);
    return { features };
  }

  saveState() {
    return { schema: 'm11j-action-world-state-v1', scheduleSHA256: this.scheduleSHA256,
      time: this.time, events: clone(this.events), executed: clone(this.executed),
      pending: this.pending.map(e => e.id), nextEventId: this.nextEventId,
      nextExecutionId: this.nextExecutionId };
  }
}
