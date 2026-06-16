import { useEffect, useState } from 'react';

/**
 * Returns `value` after it has been stable for `delayMs`. Use to keep
 * per-keystroke state out of query keys so a network request fires once per
 * pause in typing instead of once per character.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
