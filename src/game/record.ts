import type { Game } from '../engine/game';
import type { MatchRecord } from '../storage';

export function buildMatchRecord(model: Game): MatchRecord {
  const player = model.player;
  return {
    result: model.result === 'running' ? 'timeout' : model.result,
    duration: model.time,
    playerHero: player.heroId,
    enemyHero: model.enemy.heroId,
    kills: player.kills,
    deaths: player.deaths,
    lastHits: player.lastHits,
    gold: player.gold,
    damage: Math.round(player.damageToHeroes),
    date: new Date().toISOString(),
    timeline: model.timeline.list()
  };
}
