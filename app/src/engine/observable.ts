import { useSyncExternalStore } from 'react';

// Minimal external store for low-rate app state (settings, connection status).
// High-rate telemetry does not go through here; it lives in Reanimated shared values.
export interface Store<T extends object> {
  get(): T;
  set(patch: Partial<T>): void;
  subscribe(fn: () => void): () => void;
  use(): T;
  // Re-renders only when the selected value changes. Select primitives, not new objects.
  useSelect<R>(selector: (s: T) => R): R;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  const store: Store<T> = {
    get: () => state,
    set(patch) {
      let changed = false;
      for (const k in patch) {
        if (!Object.is(patch[k], state[k])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...patch };
      listeners.forEach(l => l());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    use() {
      return useSyncExternalStore(store.subscribe, store.get);
    },
    useSelect(selector) {
      return useSyncExternalStore(store.subscribe, () => selector(state));
    },
  };
  return store;
}
