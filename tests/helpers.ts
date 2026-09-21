import { Match } from '../src/engine/game';

export function createMatch(hero = 'lan', aiHero = 'vera', duration = 900): Match {
  const match = new Match({ practice: false, duration, aiHeroId: aiHero });
  match.setup(hero);
  return match;
}

export function step(match: Match, seconds: number, dt = 0.05): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) match.update(dt);
}

export function learnAllBasic(match: Match): void {
  // 通过击杀小兵快速升级并学习 Q/W
  const grants = () => {
    match.grantXp(match.player, 500);
    match.upgradeSkill(match.player, 0);
    match.upgradeSkill(match.player, 1);
  };
  grants();
}
