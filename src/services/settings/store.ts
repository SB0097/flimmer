import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

export interface SettingsStore<T> {
  get(): T;
  set(value: T): void;
  update(patch: Partial<T>): void;
  reset(): void;
  use(): T;
}

/**
 * Einstellungen, die lokal gespeichert werden und sich überall live aktualisieren.
 * `sanitize` bekommt den gespeicherten Rohwert (oder undefined) und liefert
 * immer einen vollständigen, gültigen Wert zurück.
 */
export function createSettingsStore<T>(
  key: string,
  defaults: T,
  sanitize: (raw: unknown) => T,
): SettingsStore<T> {
  let current: T | undefined;
  const listeners = new Set<() => void>();

  function load(): T {
    try {
      const stored = Storage.getItemSync(key);
      return sanitize(stored ? JSON.parse(stored) : undefined);
    } catch {
      return defaults;
    }
  }

  function get(): T {
    current ??= load();
    return current;
  }

  function set(value: T) {
    current = value;
    Storage.setItem(key, JSON.stringify(value)).catch(() => {});
    listeners.forEach((l) => l());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    get,
    set,
    update: (patch) => set({ ...get(), ...patch }),
    reset: () => set(defaults),
    use: () => useSyncExternalStore(subscribe, get),
  };
}
