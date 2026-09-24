import { findItem } from '../data/items';
import type { Hero } from './types';

export interface ItemUseCheck {
  ok: boolean;
  reason?: string;
}

export function itemCooldownRemaining(hero: Hero, itemId: string): number {
  return Math.max(0, hero.itemCooldowns?.[itemId] ?? 0);
}

export function canUseItem(hero: Hero, itemId: string, matchRunning: boolean): ItemUseCheck {
  if (!matchRunning) return { ok: false, reason: '比赛已结束' };
  if (!hero.alive) return { ok: false, reason: '英雄已死亡' };
  const item = findItem(itemId);
  if (!item) return { ok: false, reason: '物品不存在' };
  if (!hero.items.includes(itemId)) return { ok: false, reason: '未拥有该装备' };
  if (!item.active) return { ok: false, reason: '被动装备无法主动使用' };
  if (itemCooldownRemaining(hero, itemId) > 0) return { ok: false, reason: '冷却中' };
  return { ok: true };
}

export type ItemSlotState = 'passive' | 'ready' | 'cooldown' | 'unavailable';

export function itemSlotState(hero: Hero, itemId: string, matchRunning: boolean): { state: ItemSlotState; remaining: number } {
  const item = findItem(itemId);
  if (!item || !item.active) return { state: 'passive', remaining: 0 };
  const remaining = itemCooldownRemaining(hero, itemId);
  if (remaining > 0) return { state: 'cooldown', remaining };
  if (!canUseItem(hero, itemId, matchRunning).ok) return { state: 'unavailable', remaining: 0 };
  return { state: 'ready', remaining: 0 };
}
