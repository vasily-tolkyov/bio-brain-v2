/** L3b visual interface. These are spatial dimensions, never temporal averages.
 * Each three-row column is a neighbourhood; top-k and normalization are local
 * to each 27-pixel field. Optical geometry/transmission remains unchanged. */
export const RETINA = Object.freeze({ rows: 3, columns: 9, pixels: 27, topK: 6 });

export function visualValues(input, length) {
  if ((!Array.isArray(input) && !ArrayBuffer.isView(input)) || input.length !== length) {
    throw new TypeError(`Expected ${length} visual readings`);
  }
  const values = Array.from(input);
  if (values.some(x => !Number.isFinite(x) || x < 0 || x > 1)) {
    throw new RangeError('Visual readings must be in [0,1]');
  }
  return values;
}

export class SliceRetina {
  constructor({ blocks = 1, topK = RETINA.topK } = {}) {
    if (!Number.isSafeInteger(blocks) || blocks < 1 || blocks > 9
        || !Number.isInteger(topK) || topK < 1 || topK > RETINA.pixels) {
      throw new RangeError('Invalid retinal blocks or top-k');
    }
    this.blocks = blocks;
    this.topK = topK;
    Object.freeze(this);
  }

  apply(input) {
    const raw = visualValues(input, this.blocks * RETINA.pixels);
    const contrasted = raw.map((x, p) => {
      const start = Math.floor(p / 27) * 27, c = p % 9;
      const a = raw[start + c], b = raw[start + 9 + c], d = raw[start + 18 + c];
      // Exact uniform neighbourhoods must not become positive learning sources
      // from floating cancellation. No epsilon or previous frame is involved.
      return a === b && b === d ? 0 : Math.max(0, (3 * x - a - b - d) / 3);
    });
    const values = Array(raw.length).fill(0);
    for (let start = 0; start < raw.length; start += 27) {
      const keep = contrasted.slice(start, start + 27).map((value, p) => ({ value, p }))
        .filter(row => row.value > 0).sort((a, b) => b.value - a.value || a.p - b.p).slice(0, this.topK);
      for (const { value, p } of keep) values[start + p] = value / keep[0].value;
    }
    return { input: raw, contrasted, values };
  }
}

/** Nine separated planar fields. Gaps define retinal locality, not inhibition
 * or distance-dependent attenuation inside the light base. */
export const DELAY_LAYOUT = Object.freeze(Array.from({ length: 243 }, (_, cell) => {
  const k = Math.floor(cell / 27), pixel = cell % 27;
  return Object.freeze({ cell, k, pixel, x: 12 * (k % 3) + pixel % 9,
    y: 6 * Math.floor(k / 3) + Math.floor(pixel / 9) });
}));

export function tileTimeCopies(cellMajor) {
  const lines = visualValues(cellMajor, 243);
  return DELAY_LAYOUT.map(({ k, pixel }) => lines[pixel * 9 + k]);
}

export function placeSnapshot(pixels, k) {
  const values = visualValues(pixels, 27);
  if (!Number.isInteger(k) || k < 0 || k >= 9) throw new RangeError('Invalid delay column');
  return DELAY_LAYOUT.map(port => port.k === k ? values[port.pixel] : 0);
}
