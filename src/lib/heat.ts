// Where arrows landed, as a density picture. No Vue, so it is tested with `npm test`.

export type Heat = {
  /** Cells per side. The grid covers -extent to +extent on both axes. */
  size: number;
  extent: number;
  /** Row by row, the top row (largest y) first, like the picture. */
  cells: number[];
  /** The largest cell, 0 when nothing was counted. */
  max: number;
  /** Arrows that fell outside the grid and are not in it. */
  outside: number;
};

/**
 * Every arrow adds a soft bump (a Gaussian, `sigma` cells wide) to the cells around it, so a few arrows
 * make a blob and many arrows make a map. Positions: x right, y up, 1 = the spot's outer edge.
 */
export function density(points: [number, number][], size = 40, extent = 1.2, sigma = 1.3): Heat {
  const cells = new Array<number>(size * size).fill(0);
  const step = (2 * extent) / size;
  const reach = Math.ceil(3 * sigma);
  let outside = 0;
  for (const [x, y] of points) {
    const column = (x + extent) / step - 0.5; // where the arrow is, in cell units, measured from the first cell's centre
    const row = (extent - y) / step - 0.5;
    if (x < -extent || x >= extent || y <= -extent || y > extent) {
      outside++;
      continue;
    }
    for (let r = Math.max(0, Math.round(row) - reach); r <= Math.min(size - 1, Math.round(row) + reach); r++) {
      for (let c = Math.max(0, Math.round(column) - reach); c <= Math.min(size - 1, Math.round(column) + reach); c++) {
        cells[r * size + c]! += Math.exp(-((c - column) ** 2 + (r - row) ** 2) / (2 * sigma ** 2));
      }
    }
  }
  return { size, extent, cells, max: Math.max(0, ...cells), outside };
}
