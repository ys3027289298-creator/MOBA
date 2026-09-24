export interface TrainingConfig {
  startLevel: number;
  startGold: number;
  fullMana: boolean;
  enemyEnabled: boolean;
  autoWaves: boolean;
}

export const TRAINING_LIMITS = {
  minLevel: 1,
  maxLevel: 8,
  minGold: 0,
  maxGold: 6000,
  maxTargets: 3
} as const;

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  startLevel: 1,
  startGold: 500,
  fullMana: true,
  enemyEnabled: true,
  autoWaves: true
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function toBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeTrainingConfig(input?: Partial<TrainingConfig> | null): TrainingConfig {
  const src = (input ?? {}) as Record<string, unknown>;
  return {
    startLevel: clampInt(src.startLevel, DEFAULT_TRAINING_CONFIG.startLevel, TRAINING_LIMITS.minLevel, TRAINING_LIMITS.maxLevel),
    startGold: clampInt(src.startGold, DEFAULT_TRAINING_CONFIG.startGold, TRAINING_LIMITS.minGold, TRAINING_LIMITS.maxGold),
    fullMana: toBool(src.fullMana, DEFAULT_TRAINING_CONFIG.fullMana),
    enemyEnabled: toBool(src.enemyEnabled, DEFAULT_TRAINING_CONFIG.enemyEnabled),
    autoWaves: toBool(src.autoWaves, DEFAULT_TRAINING_CONFIG.autoWaves)
  };
}

export interface TrainingCommandState {
  paused: boolean;
  result: string;
}

export function trainingCommandsEnabled(state: TrainingCommandState): boolean {
  return !state.paused && state.result === 'running';
}
