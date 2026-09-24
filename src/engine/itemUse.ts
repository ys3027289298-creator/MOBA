import { findItem, type ItemDef } from '../data/items';
import type { Hero } from './types';

export const ACTIVE_ITEM_COOLDOWNS: Record<string, number> = {
  chalice: 20,
  phoenix: 30
};

export function itemCooldownKey(itemId: string): string {
  return `item:${itemId}`;
}

export function itemCooldownRemaining(hero: Hero, itemId: string): number {
  return Math.max(0, hero.cooldowns?.[itemCooldownKey(itemId)] ?? 0);
}

export interface ItemUseCheck {
  ok: boolean;
  reason?: string;
  item?: ItemDef;
}

export function canUseItem(hero: Hero, itemId: string, matchOver: boolean): ItemUseCheck {
  const item = findItem(itemId);
  if (!item) return { ok: false, reason: '未知装备' };
  if (!hero.items.includes(itemId)) return { ok: false, reason: '未拥有该装备' };
  if (!item.active) return { ok: false, reason: '该装备没有主动效果' };
  if (!hero.alive) return { ok: false, reason: '英雄已死亡' };
  if (matchOver) return { ok: false, reason: '比赛已结束' };
  if (itemCooldownRemaining(hero, itemId) > 0) return { ok: false, reason: '冷却中' };
  return { ok: true, item };
}
