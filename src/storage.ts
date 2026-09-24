import type { TimelineEvent } from './engine/timeline';

export interface MatchRecord {
  result: 'victory' | 'defeat' | 'timeout';
  duration: number;
  playerHero: string;
  enemyHero: string;
  kills: number;
  deaths: number;
  lastHits: number;
  gold: number;
  damage: number;
  date: string;
  timeline?: TimelineEvent[];
}

export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  cameraZoom: number;
  showDamage: boolean;
  lockedPointer: boolean;
}

const SETTINGS_KEY = 'star-ring-arena-settings';
const RECORDS_KEY = 'star-ring-arena-records';

export const defaultSettings: Settings = {
  musicVolume: 0.5,
  sfxVolume: 0.7,
  cameraZoom: 1,
  showDamage: true,
  lockedPointer: false
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadRecords(): MatchRecord[] {
  try {
    return JSON.parse(localStorage.getItem(RECORDS_KEY) ?? '[]') as MatchRecord[];
  } catch {
    return [];
  }
}

export function saveRecord(record: MatchRecord) {
  const records = loadRecords();
  records.unshift(record);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records.slice(0, 20)));
}
