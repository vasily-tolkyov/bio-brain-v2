/** Read-only phase diagnostics. No neural parameters are changed. */

export function directedProfile(p, A, B) {
  return Array.from({ length: 9 }, (_, k) => {
    const source = p.line(A, k), target = p.line(B, 0);
    const sums = [0, 0], edges = [0, 0];
    for (const { EE, E } of p.layer2.replicas) for (let e = 0; e < EE.pre.length; e++) {
      const a = Math.floor((EE.pre[e] - E) / p.layer2.cellsPerLine);
      const b = Math.floor((EE.post[e] - E) / p.layer2.cellsPerLine);
      const d = a === source && b === target ? 0 : a === target && b === source ? 1 : -1;
      if (d >= 0) { sums[d] += EE.stdp.rho[e]; edges[d]++; }
    }
    return { k, forward: edges[0] ? sums[0] / edges[0] : null,
      reverse: edges[1] ? sums[1] / edges[1] : null, edges };
  });
}

export function chainDiagnostics(p, baseline, training, downward) {
  const id = name => p.mapping.find(a => a.feature === name).id;
  return { phases: training.phases.map(phase => ({ phase: phase.phase, directed: phase.directed })),
    pressLight: downward.weights.filter(w => w.A === 'action:press' && w.B === id('light')),
    birdLight: downward.weights.filter(w => w.A === id('bird') && w.B === id('light')),
    pressBell: downward.weights.filter(w => w.A === 'action:press' && w.B === id('bell')) };
}
