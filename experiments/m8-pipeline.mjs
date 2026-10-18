/** M8 wiring: the only environment access is the fixed IO object. */
import { AttractorLayer } from '../src/layer.mjs';
import { OutputLayer } from '../src/output.mjs';
import { attachLearning, learnWindow } from '../src/learning.mjs';
import { checkEnv, teachGroups, actionId, presentWindow, discardHistory } from '../src/io.mjs';
import { WINDOW_MS } from '../src/readout.mjs';

export function actionPipeline(env, seed) {
  checkEnv(env);
  const teacher = teachGroups(env.features, seed), output = new OutputLayer(env.actions, seed);
  const mapping = [...teacher.mapping, ...output.mapping.map(a =>
    ({ ...a, id: actionId(a.feature), feature: actionId(a.feature) }))];
  const ids = mapping.map(a => a.id);
  return attachLearning({ env, layer1: teacher.layer, output, mapping, teacher, t: 0,
    layer2: new AttractorLayer({ n: ids.length * 9, R: 1, seed: seed + 30000, level: 2 }),
    line: (name, col) => mapping.findIndex(a => a.feature === name) * 9 + col }, seed);
}

export function advanceActions(p, drive) {
  const t = p.t, executed = p.output.step(drive), start = p.layer1.t;
  presentWindow(p.layer1, p.env, WINDOW_MS, {}, executed.action);
  const lit = p.layer1.readout(start);
  const copy = executed.action === null ? [] : [{ id: actionId(executed.action), strength: executed.strength }];
  const result = { t, lit, executed, ...learnWindow(p, [...lit, ...copy]) };
  discardHistory(p.layer1); discardHistory(p.layer2);
  p.t += WINDOW_MS;
  return result;
}
