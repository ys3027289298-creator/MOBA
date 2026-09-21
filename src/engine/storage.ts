// 本地存储：设置、对战记录（localStorage），浏览器不可用时安全降级。

export interface GameSettings {
  masterVolume: number;
  showDamageNumbers: boolean;
  cameraZoom: number;
  screenShake: boolean;
}

export interface MatchRecord {
  id: number;
  date: string;
  result: 'victory' | 'defeat' | 'timeout-victory' | 'timeout-defeat';
  duration: number;
  heroId: string;
  aiHeroId: string;
  kills: number;
  deaths: number;
  cs: number;
  gold: number;
  damageDealt: number;
  practice: boolean;
}

const SETTINGS_KEY = 'sra.settings.v1';
const RECORDS_KEY = 'sra.records.v1';

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.7,
  showDamageNumbers: true,
  cameraZoom: 1,
  screenShake: true
};

function hasStorage(): boolean {
  try {
    const key = '__sra_test__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(): GameSettings {
  if (!hasStorage()) return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  if (!hasStorage()) return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadRecords(): MatchRecord[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    const list = raw ? (JSON.parse(raw) as MatchRecord[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveRecord(record: Omit<MatchRecord, 'id' | 'date'>): MatchRecord[] {
  const records = loadRecords();
  const full: MatchRecord = {
    ...record,
    id: records.length ? records[0].id + 1 : 1,
    date: new Date().toISOString()
  };
  records.unshift(full);
  const trimmed = records.slice(0, 30);
  if (hasStorage()) localStorage.setItem(RECORDS_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function clearRecords(): void {
  if (hasStorage()) localStorage.removeItem(RECORDS_KEY);
}
