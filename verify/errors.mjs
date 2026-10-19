/** Current error verification is N-only. Historical prediction-M tests are in the sealed M11g source archive. */
import { pathToFileURL } from 'node:url';
import { verifyNovelty } from './novelty.mjs';
export const verifyErrors = verifyNovelty;
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = verifyErrors() ? 0 : 1;
