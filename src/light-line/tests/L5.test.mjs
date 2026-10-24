import test from 'node:test';
import { ledgerChecks } from './L5-ledgers.mjs';
test('L5 binary boundaries and preserved event/goal algorithms', () => ledgerChecks());
