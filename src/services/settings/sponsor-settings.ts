import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import {
  DEFAULT_SPONSOR_SETTINGS,
  SEGMENT_CATEGORIES,
  type CategoryMode,
  type SegmentCategory,
  type SponsorSettings,
} from '@/lib/segments';

const KEY = 'settings.sponsorblock.v1';
const MODES: CategoryMode[] = ['auto', 'manual', 'off'];

/** Nimmt gespeicherte Werte, ergänzt fehlende Kategorien mit Standardwerten */
function sanitize(raw: unknown): SponsorSettings {
  const result = { ...DEFAULT_SPONSOR_SETTINGS };
  if (raw && typeof raw === 'object') {
    for (const category of SEGMENT_CATEGORIES) {
      const value = (raw as Record<string, unknown>)[category];
      if (MODES.includes(value as CategoryMode)) result[category] = value as CategoryMode;
    }
  }
  return result;
}

function load(): SponsorSettings {
  try {
    const stored = Storage.getItemSync(KEY);
    return sanitize(stored ? JSON.parse(stored) : undefined);
  } catch {
    return { ...DEFAULT_SPONSOR_SETTINGS };
  }
}

let current: SponsorSettings | undefined;
const listeners = new Set<() => void>();

function getSnapshot(): SponsorSettings {
  current ??= load();
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setCategoryMode(category: SegmentCategory, mode: CategoryMode) {
  current = { ...getSnapshot(), [category]: mode };
  Storage.setItem(KEY, JSON.stringify(current)).catch(() => {});
  listeners.forEach((l) => l());
}

export function resetSponsorSettings() {
  current = { ...DEFAULT_SPONSOR_SETTINGS };
  Storage.setItem(KEY, JSON.stringify(current)).catch(() => {});
  listeners.forEach((l) => l());
}

/** Aktuelle SponsorBlock-Einstellungen; aktualisiert sich bei Änderungen überall */
export function useSponsorSettings(): SponsorSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}
