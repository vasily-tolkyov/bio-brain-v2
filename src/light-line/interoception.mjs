/** Fixed body encoding and deficit bar. No learned state; outside neural ticks. */
import { DOWNWARD } from './downward.mjs';

export const INTEROCEPTION = Object.freeze({ bins: 5, saturationDeviation: 0.25 });
export const binId = (variable, bin) => `body:${variable}:${bin}`;
export const changeId = (variable, direction, magnitude) =>
  `change:${variable}:${direction > 0 ? 'rise' : 'fall'}:${magnitude}`;
export const binIndex = (v, value) => Math.min(v.bins - 1,
  Math.floor((value - v.min) / (v.max - v.min) * v.bins));

export function bodyVariables(declarations = []) {
  return Object.freeze(declarations.map((v, index) => {
    const variable = { ...v, bins: v.bins ?? INTEROCEPTION.bins, index };
    variable.ids = Object.freeze(Array.from({ length: variable.bins }, (_, b) => binId(index, b)));
    variable.maxChange = v.maxChange ?? variable.bins - 1;
    variable.changes = Object.freeze([1, -1].flatMap(direction =>
      Array.from({ length: variable.maxChange }, (_, i) => Object.freeze({
        id: changeId(index, direction, i + 1), direction, magnitude: i + 1 }))));
    variable.featureIds = Object.freeze([...variable.ids, ...variable.changes.map(c => c.id)]);
    variable.setpointBin = binIndex(variable, variable.setpoint);
    return Object.freeze(variable);
  }));
}

export function bodyReading(variables, readings) {
  if (!readings || typeof readings !== 'object' || Array.isArray(readings) ||
      Object.keys(readings).length !== variables.length) throw new Error('Invalid interoception readings');
  return variables.map(v => {
    const value = readings[v.name];
    if (!Number.isFinite(value) || value < v.min || value > v.max) throw new Error('Invalid body value');
    const bin = binIndex(v, value), deviation = Math.abs(value - v.setpoint) / (v.max - v.min);
    const direction = Math.sign(v.setpointBin - bin);
    const drive = direction === 0 ? 0 : Math.min(1, deviation / INTEROCEPTION.saturationDeviation);
    return { variable: v, value, bin, deviation, direction, drive,
      id: direction === 0 ? null : changeId(v.index, direction, 1) };
  });
}

/** View of live W, not a second index/weight/preference store. Filter each edge
 * before ranking. Overshoot earns no credit: relief stops at the setpoint. */
export function relievingRules(downward, request, threshold) {
  if (!request || request.drive === 0) return [];
  const { variable: v, bin, direction, drive } = request;
  return downward.weights.flatMap(rule => {
    const change = v.changes.find(c => c.id === rule.B);
    if (!change || change.direction !== direction ||
        rule.W / DOWNWARD.wMax < threshold) return [];
    const relief = Math.min(change.magnitude, Math.abs(v.setpointBin - bin)) / v.bins;
    return [{ rule, magnitude: change.magnitude, relief,
      score: drive * (rule.W / DOWNWARD.wMax) * relief }];
  }).sort((a, b) => b.score - a.score);
}
