import Phaser from 'phaser';
import type { Enemy } from '@withergate/shared';
import { bus } from '../bridge/bus';
import { store } from '../bridge/store';
import type { BattleEvent } from '../core/combat/battle';
import { STATUS_LABELS } from '../core/combat/battle';
import { makePlaceholderCharacter } from './draw';

type Actor = Phaser.GameObjects.Sprite | Phaser.GameObjects.Container;

const CHAR_SCALE = 0.6;
const PLAYER_X = 380;
const ENEMY_X = 930;
const FLOOR_Y = 610;

/**
 * Renders a fight over the paused world: player and companions on the left, the enemy on
 * the right, and small animations for each combat event. The menu and log are React.
 */
export class BattleScene extends Phaser.Scene {
  private enemyId = '';
  private enemyObj!: Actor;
  private playerObj!: Actor;
  private companions = new Map<string, Actor>();
  private unsub: (() => void)[] = [];

  constructor() {
    super('battle');
  }

  init(data: { enemy: string }): void {
    this.enemyId = data.enemy;
  }

  create(): void {
    const enemy = store.content.enemies[this.enemyId];
    this.add.rectangle(0, 0, 1280, 720, 0x05060a, 0.62).setOrigin(0);
    const glow = this.add.graphics();
    glow.fillStyle(0xffffff, 0.05);
    glow.fillEllipse(640, FLOOR_Y + 8, 980, 70);

    this.playerObj = this.makeCharacter(this.playerSet(), PLAYER_X, FLOOR_Y, CHAR_SCALE, store.state?.player.name ?? 'You');
    (store.state?.party ?? []).forEach((id, i) => {
      const profile = store.content.villagers[id]?.profile;
      const set = profile?.sprite_set ?? id;
      const obj = this.makeCharacter(store.assets.sprites[set] ? set : null, PLAYER_X - 140 - i * 115, FLOOR_Y + 6, CHAR_SCALE * 0.92, profile?.name ?? id);
      obj.setAlpha(0.92);
      this.companions.set(id, obj);
    });
    this.enemyObj = enemy ? this.makeEnemy(enemy) : this.makeCharacter(null, ENEMY_X, FLOOR_Y, 1, this.enemyId);

    this.unsub = [
      bus.on('battle.event', (ev) => this.animate(ev)),
      bus.on('battle.end', () => this.time.delayedCall(450, () => this.scene.stop())),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsub.forEach((u) => u());
      this.unsub = [];
    });
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  private playerSet(): string | null {
    const form = store.state?.player.form ?? 'fem';
    const wanted = form === 'masc' ? 'player_m' : 'player_f';
    if (store.assets.sprites[wanted]) return wanted;
    const other = form === 'masc' ? 'player_f' : 'player_m';
    return store.assets.sprites[other] ? other : null;
  }

  private makeCharacter(set: string | null, x: number, y: number, scale: number, name: string): Actor {
    if (set && this.textures.exists(`sprite:${set}`)) {
      const info = store.assets.sprites[set]!;
      const sprite = this.add.sprite(x, y, `sprite:${set}`).setOrigin(0.5, info.originY).setScale(scale);
      const idle = info.animations.idle ? `${set}:idle` : null;
      if (idle && this.anims.exists(idle)) sprite.play(idle);
      else {
        const walk = info.animations.rightwalk ?? info.animations.leftwalk;
        if (walk) sprite.setFrame(walk.from);
      }
      return sprite;
    }
    return makePlaceholderCharacter(this, x, y, name);
  }

  private makeEnemy(enemy: Enemy): Actor {
    const set = enemy.sprite_set ?? enemy.id;
    if (store.assets.sprites[set] && this.textures.exists(`sprite:${set}`)) {
      const info = store.assets.sprites[set]!;
      const sprite = this.add.sprite(ENEMY_X, FLOOR_Y, `sprite:${set}`).setOrigin(0.5, info.originY).setScale(CHAR_SCALE);
      const idle = info.animations.idle ? `${set}:idle` : null;
      if (idle && this.anims.exists(idle)) sprite.play(idle);
      else if (info.animations.leftwalk) sprite.setFrame(info.animations.leftwalk.from);
      return sprite;
    }
    // Placeholder creature: a hunched silhouette sized by tier, with eyes.
    const size = enemy.tier === 'boss' ? 1.5 : enemy.tier === 'elite' ? 1.2 : 1;
    const color = enemy.tier === 'boss' ? 0x6a1f2f : enemy.tier === 'elite' ? 0x4a2f5a : 0x2f3542;
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillEllipse(0, -70 * size, 190 * size, 130 * size);
    g.fillEllipse(-40 * size, -20 * size, 90 * size, 50 * size);
    g.fillEllipse(40 * size, -20 * size, 90 * size, 50 * size);
    g.fillStyle(0xff5a5a, 1);
    g.fillCircle(-30 * size, -85 * size, 7 * size);
    g.fillCircle(-2 * size, -90 * size, 7 * size);
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(0, 4, 200 * size, 26);
    const label = this.add
      .text(0, -150 * size, enemy.name, { fontFamily: 'Georgia, serif', fontSize: '20px', color: '#fff4e0', stroke: '#000000aa', strokeThickness: 4 })
      .setOrigin(0.5, 1);
    return this.add.container(ENEMY_X, FLOOR_Y, [g, label]);
  }

  // --- animation ------------------------------------------------------------

  private actorFor(id: string): Actor {
    if (id === 'player') return this.playerObj;
    if (id === 'enemy') return this.enemyObj;
    return this.companions.get(id) ?? this.playerObj;
  }

  private headOf(obj: Actor): { x: number; y: number } {
    const h = obj instanceof Phaser.GameObjects.Sprite ? obj.displayHeight : 150;
    return { x: obj.x, y: obj.y - h - 10 };
  }

  private float(obj: Actor, text: string, color: string, size = 28): void {
    const at = this.headOf(obj);
    const t = this.add
      .text(at.x, at.y, text, { fontFamily: 'Georgia, serif', fontSize: `${size}px`, color, stroke: '#000000', strokeThickness: 5, fontStyle: 'bold' })
      .setOrigin(0.5, 1)
      .setDepth(50);
    this.tweens.add({ targets: t, y: at.y - 46, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private shake(obj: Actor): void {
    const x0 = obj.x;
    this.tweens.add({ targets: obj, x: x0 + 10, duration: 50, yoyo: true, repeat: 3, onComplete: () => obj.setX(x0) });
  }

  private flash(obj: Actor, tint = 0xff6b6b): void {
    if (obj instanceof Phaser.GameObjects.Sprite) {
      obj.setTint(tint);
      this.time.delayedCall(180, () => obj.clearTint());
    } else {
      obj.setAlpha(0.35);
      this.time.delayedCall(120, () => obj.setAlpha(1));
    }
  }

  private lunge(obj: Actor, dx: number): void {
    const x0 = obj.x;
    this.tweens.add({ targets: obj, x: x0 + dx, duration: 110, yoyo: true, ease: 'Quad.easeOut', onComplete: () => obj.setX(x0) });
  }

  private animate(ev: BattleEvent): void {
    switch (ev.type) {
      case 'hit': {
        const target = this.actorFor(ev.target);
        const actor = this.actorFor(ev.actor);
        this.lunge(actor, ev.target === 'enemy' ? 60 : -60);
        this.time.delayedCall(110, () => {
          this.shake(target);
          this.flash(target);
          this.float(target, `${ev.crit ? '✦ ' : ''}${ev.damage}`, ev.crit ? '#ffd166' : '#ffffff', ev.crit ? 34 : 28);
        });
        break;
      }
      case 'miss':
        this.lunge(this.enemyObj, -50);
        this.float(this.actorFor(ev.target), 'miss', '#cfd8e3', 22);
        break;
      case 'heal':
        this.flash(this.actorFor(ev.target), 0x8cff9a);
        this.float(this.actorFor(ev.target), `+${ev.amount}`, '#8cff9a');
        break;
      case 'status':
        this.float(this.actorFor(ev.target), STATUS_LABELS[ev.status], '#e2c27a', 22);
        break;
      case 'status_tick':
        this.flash(this.actorFor(ev.target));
        this.float(this.actorFor(ev.target), `${ev.damage}`, '#ff9c9c', 24);
        break;
      case 'skip':
        this.float(this.actorFor(ev.target), `${STATUS_LABELS[ev.status]}…`, '#cfd8e3', 22);
        break;
      case 'defend':
        this.flash(this.playerObj, 0x9ec5ff);
        this.float(this.playerObj, 'brace', '#9ec5ff', 22);
        break;
      case 'intercept': {
        const c = this.companions.get(ev.by);
        if (c) {
          this.lunge(c, 90);
          this.float(c, 'blocked!', '#9ec5ff', 22);
        }
        this.lunge(this.enemyObj, -50);
        break;
      }
      case 'power':
        this.flash(this.actorFor(ev.by), 0xfff1a8);
        this.float(this.actorFor(ev.by), ev.name, '#fff1a8', 22);
        break;
      case 'flee':
        if (ev.success) this.tweens.add({ targets: this.playerObj, x: -200, alpha: 0.2, duration: 600, ease: 'Quad.easeIn' });
        else this.float(this.playerObj, 'no escape', '#cfd8e3', 22);
        break;
      case 'spare':
        if (ev.success) this.tweens.add({ targets: this.enemyObj, x: 1500, alpha: 0.3, duration: 700, ease: 'Quad.easeIn' });
        else this.float(this.enemyObj, '…', '#cfd8e3', 26);
        break;
      case 'end':
        if (ev.result === 'won') this.tweens.add({ targets: this.enemyObj, alpha: 0, y: FLOOR_Y + 30, duration: 600 });
        if (ev.result === 'lost') this.tweens.add({ targets: this.playerObj, alpha: 0, y: FLOOR_Y + 30, duration: 700 });
        break;
      default:
        break;
    }
  }
}
