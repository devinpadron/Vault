// Shared formatters. Currently a single USD formatter — collapses 1,234.56
// into 1,235 once the value is "big enough" to make cents noise.

export function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toFixed(2);
}
