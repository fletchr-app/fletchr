// Arithmetic the way the server's Python does it, so the numbers computed on the device are the same as the server's.
// No Vue, tested under `npm test`.

/** Python's `round(x, digits)` (digits 1 or more): the exact value is rounded, and an exact tie goes to the even digit (JavaScript's rounds ties up). */
export function pyRound(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x;
  const exact = Math.abs(x).toFixed(100); // a double has a finite decimal expansion, this is all of it for the sizes used here
  const dot = exact.indexOf('.');
  const kept = exact.slice(0, dot + 1 + digits);
  const tie = /^50*$/.test(exact.slice(dot + 1 + digits));
  if (!tie) return Number(x.toFixed(digits));
  const down = Number(kept);
  const even = Number(kept.at(-1)) % 2 === 0;
  const rounded = even ? down : Number((down + 10 ** -digits).toFixed(digits));
  return x < 0 ? -rounded : rounded;
}


/**
 * Python's `sum` of floats. Since Python 3.12 it adds with a running error term (Neumaier), which gives a different last bit
 * than a plain loop, and that decides the sign of a result that is nearly zero or a tie at the rounding.
 */
export function pySum(values: number[]): number {
  let sum = 0;
  let compensation = 0;
  for (const x of values) {
    const t = sum + x;
    if (!Number.isFinite(t)) return values.reduce((a, b) => a + b, 0);
    compensation += Math.abs(sum) >= Math.abs(x) ? sum - t + x : x - t + sum;
    sum = t;
  }
  return sum + compensation;
}
