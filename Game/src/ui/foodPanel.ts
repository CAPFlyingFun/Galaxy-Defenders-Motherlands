// ============================================================================
// ui/foodPanel.ts -- THE FRIDGE'S AND THE PANTRY'S PANEL (v0.2.181; Joshua, 2026-11-27: "When a user gets to the
// refrigerator, it should be like sims or other games and it shows you the food list you can choose yourself like a
// large meal, snack, etc… with little icons or images like an inventory").
//
// What is in it, as tiles: each item's picture (an emoji: nothing to download), its name, its kind and size, and how
// many are left ("none left" greyed, and not picked). The fridge has two tabs, FOOD and DRINKS; the pantry one list.
// The game keeps running while it is open (his "Keep running"); it closes when something is picked, with ✕, when the
// prompt is tapped again, or when the one played walks away from it (main.ts).
//
// A picked tile tells main.ts (`onPick`), which hands it to their mind (mind.ts `doNow`, an `eatItem`): a full meal is
// eaten at the table, anything else right there standing (mind/food.ts).
// ============================================================================
import './foodPanel.css';
import { KIND_WORD, atTheTable, type FoodItem } from '../mind/food';

/** One tile's worth: the item and how many are left. */
export interface PanelItem {
  readonly item: FoodItem;
  readonly count: number;
}

export class FoodPanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly note: HTMLElement;
  /** which tab shows (the fridge: food or drinks) */
  private tab: 'food' | 'drinks' = 'food';
  private items: readonly PanelItem[] = [];
  private kind: 'fridge' | 'pantry' = 'fridge';
  /** what the tiles were last drawn from (counts change while it is open: drawn again only when they do) */
  private drawnKey = '';

  constructor(host: HTMLElement, private readonly onPick: (item: FoodItem) => void, private readonly onClose: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'gd-food';
    this.root.hidden = true;
    const head = document.createElement('div');
    head.className = 'gd-food-head';
    this.title = document.createElement('div');
    this.title.className = 'gd-food-title';
    this.tabs = document.createElement('div');
    this.tabs.className = 'gd-food-tabs';
    for (const [id, label] of [['food', 'Food'], ['drinks', 'Drinks']] as const) {
      const b = document.createElement('button');
      b.className = 'gd-food-tab';
      b.dataset.tab = id;
      b.textContent = label;
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.tab = id; this.draw(true); });
      this.tabs.appendChild(b);
    }
    const close = document.createElement('button');
    close.className = 'gd-food-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '✕';
    close.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.close(); this.onClose(); });
    head.append(this.title, this.tabs, close);
    this.grid = document.createElement('div');
    this.grid.className = 'gd-food-grid';
    this.note = document.createElement('div');
    this.note.className = 'gd-food-note';
    this.note.textContent = 'Full meals are eaten at the table. Everything else right here.';
    this.root.append(head, this.grid, this.note);
    // (touches on the panel never reach the game behind it)
    for (const kind of ['pointerdown', 'pointermove', 'pointerup', 'touchstart'] as const) this.root.addEventListener(kind, (e) => e.stopPropagation());
    host.appendChild(this.root);
  }

  get isOpen(): boolean { return !this.root.hidden; }

  /** Shown with what is in the fridge or the pantry now (the fridge opens on its food). */
  open(kind: 'fridge' | 'pantry', items: readonly PanelItem[]): void {
    this.kind = kind;
    this.tab = 'food';
    this.items = items;
    this.title.textContent = kind === 'fridge' ? 'Fridge' : 'Pantry';
    this.tabs.hidden = kind !== 'fridge';
    this.root.hidden = false;
    this.draw(true);
  }

  /** The counts as they are now (the other one may take something while it is open). */
  update(items: readonly PanelItem[]): void {
    if (!this.isOpen) return;
    this.items = items;
    this.draw(false);
  }

  close(): void { this.root.hidden = true; }

  /** The tiles of the tab showing (drawn again only when what they show has changed). */
  private draw(force: boolean): void {
    const shown = this.items.filter((e) => (this.kind === 'pantry' ? true : this.tab === 'drinks' ? e.item.kind === 'drink' : e.item.kind !== 'drink'));
    const key = `${this.kind}|${this.tab}|${shown.map((e) => `${e.item.id}:${e.count}`).join(',')}`;
    if (!force && key === this.drawnKey) return;
    this.drawnKey = key;
    for (const b of this.tabs.querySelectorAll<HTMLElement>('.gd-food-tab')) b.classList.toggle('is-on', b.dataset.tab === this.tab);
    this.grid.replaceChildren();
    for (const { item, count } of shown) {
      const tile = document.createElement('button');
      tile.className = 'gd-food-tile';
      if (count <= 0) tile.classList.add('is-out');
      const pic = document.createElement('span');
      pic.className = 'gd-food-pic';
      pic.textContent = item.emoji;
      const words = document.createElement('span');
      words.className = 'gd-food-words';
      const name = document.createElement('span');
      name.className = 'gd-food-name';
      name.textContent = item.name;
      const size = document.createElement('span');
      size.className = 'gd-food-size';
      const ml = item.kind === 'drink' ? item.waterMl : item.foodMl;
      size.textContent = `${KIND_WORD[item.kind]} · ${ml} mL`;
      // (how many are left, and a full meal's "at the table")
      const left = document.createElement('span');
      left.className = 'gd-food-left';
      left.textContent = `${count > 0 ? `×${count}` : 'none left'}${atTheTable(item) ? ' · at the table' : ''}`;
      words.append(name, size, left);
      tile.append(pic, words);
      if (count > 0) tile.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.close(); this.onPick(item); });
      this.grid.appendChild(tile);
    }
  }
}
