// Shared formatters. Currently a single USD formatter — collapses 1,234.56
// into 1,235 once the value is "big enough" to make cents noise.

export function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toFixed(2);
}

// Compact relative time ("now", "5m", "3h", "2d", then a date) for feeds/inbox.
export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
