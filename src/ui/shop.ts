import type { Game } from '../engine/game';
import { ITEMS, purchasePrice, type ItemDef } from '../data/items';

export class ShopPanel {
  readonly element: HTMLElement;
  private model: Game;
  private onPurchase?: () => void;

  constructor(model: Game, onPurchase?: () => void) {
    this.model = model;
    this.onPurchase = onPurchase;
    this.element = document.createElement('div');
    this.element.className = 'shop-panel';
    this.render();
  }

  setModel(model: Game) {
    this.model = model;
    this.render();
  }

  render() {
    const hero = this.model.player;
    const groups: Array<[ItemDef['category'], string]> = [
      ['attack', '攻击'], ['defense', '防御'], ['ability', '技能'], ['movement', '移动'], ['recovery', '恢复'], ['active', '侦查']
    ];
    this.element.innerHTML = `
      <div class="shop-title">星环商店 <span>${Math.floor(hero.gold)} 金币</span>${this.model.isAtBase(hero) ? '<em>基地中可购买</em>' : '<em class="locked">需回到基地</em>'}</div>
      ${groups.map(([category, label]) => `
        <div class="shop-group"><h4>${label}</h4>
          ${ITEMS.filter((i) => i.category === category).map((item) => {
            const price = purchasePrice(item, hero.items);
            const owned = hero.items.includes(item.id);
            const can = this.model.isAtBase(hero) && hero.gold >= price && !owned;
            return `<button class="item ${owned ? 'owned' : ''} ${can ? '' : 'disabled'}" data-id="${item.id}" ${can ? '' : 'disabled'}>
              <b>${item.name}</b><small>${item.description}</small>
              <small>配方: ${item.recipe.length ? item.recipe.map((r) => ITEMS.find((x) => x.id === r)?.name).join(' + ') : '无'}｜${price}金币</small>
            </button>`;
          }).join('')}
        </div>`).join('')}
    `;
    this.element.querySelectorAll<HTMLButtonElement>('button.item').forEach((button) => {
      button.onclick = () => {
        if (this.model.buyItem(hero, button.dataset.id!)) {
          this.onPurchase?.();
          this.render();
        }
      };
    });
  }
}
