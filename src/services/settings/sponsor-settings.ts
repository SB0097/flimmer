import {
  DEFAULT_SPONSOR_SETTINGS,
  SEGMENT_CATEGORIES,
  type CategoryMode,
  type SegmentCategory,
  type SponsorSettings,
} from '@/lib/segments';

import { createSettingsStore } from './store';

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

const store = createSettingsStore('settings.sponsorblock.v1', DEFAULT_SPONSOR_SETTINGS, sanitize);

export function setCategoryMode(category: SegmentCategory, mode: CategoryMode) {
  store.update({ [category]: mode });
}

export const resetSponsorSettings = store.reset;

/** Aktuelle SponsorBlock-Einstellungen; aktualisiert sich bei Änderungen überall */
export const useSponsorSettings = store.use;
