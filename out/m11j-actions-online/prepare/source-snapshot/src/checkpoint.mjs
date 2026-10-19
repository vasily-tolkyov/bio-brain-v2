/** Atomic same-directory replacement; no simulation or protocol work here. */
import { mkdirSync, writeFileSync, renameSync, rmSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function saveCheckpoint(file, net) {
  const serialized = JSON.stringify(net.saveState()) + '\n';
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, serialized, { flag: 'wx' });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
  return file;
}

export function loadCheckpoint(file, net) {
  return net.loadState(JSON.parse(readFileSync(file, 'utf8')));
}
