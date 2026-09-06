import Phaser from 'phaser';
import { mapEntities } from '@withergate/shared';
import type { EntityOf, GameMap, StageStep } from '@withergate/shared';
import { bus } from '../bridge/bus';
import type { EnterWorldData } from '../bridge/bus';
import { store } from '../bridge/store';
import { charactersOn } from '../core/schedule';
import { session } from '../core/session';
import {
  DEPTH,
  drawGround,
  drawHills,
  drawInteractable,
  drawPlacement,
  drawSky,
  drawSlot,
  hex,
  makeBubble,
  makePlaceholderCharacter,
} from './draw';

interface Actor {
  id: string;
  obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Container;
  set: string | null;
  facing: 'left' | 'right';
  bubble?: Phaser.GameObjects.Container;
}

const WALK_SPEED = 260;
const RUN_SPEED = 430;
const CHAR_SCALE = 0.5;
const TALK_RANGE = 110;

const EXIT_ARROWS: Record<EntityOf<'exit'>['direction'], string> = { left: '←', right: '→', up: '↑', down: '↓', door: '↑' };

function isAutoExit(exit: EntityOf<'exit'>): boolean {
  return exit.auto ?? (exit.direction === 'left' || exit.direction === 'right');
}

const PHASE_TINT: Record<string, { color: number; alpha: number } | null> = {
  morning: { color: 0xfff1d6, alpha: 0.12 },
  afternoon: null,
  evening: { color: 0xffb070, alpha: 0.45 },
  night: { color: 0x4a5a9a, alpha: 0.8 },
};

/** The side-scrolling world: one map at a time, player, NPCs, prompts and exits. */
export class WorldScene extends Phaser.Scene {
  private enter: EnterWorldData = { map: 'withergate' };
  private map!: GameMap;
  private player!: Actor;
  private npcs: Actor[] = [];
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'E' | 'SHIFT' | 'ENTER' | 'SPACE', Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private prompt!: Phaser.GameObjects.Text;
  private tintRect!: Phaser.GameObjects.Rectangle;
  private exits: EntityOf<'exit'>[] = [];
  private interactables: EntityOf<'interactable'>[] = [];
  private justArrived = true;
  private unsubscribe: (() => void)[] = [];
  private transitioning = false;

  constructor() {
    super('world');
  }

  init(data: EnterWorldData): void {
    if (data?.map) this.enter = data;
  }

  create(): void {
    const content = store.content;
    const state = store.state;
    const map = content.maps[this.enter.map] ?? content.maps[Object.keys(content.maps)[0]!];
    if (!map || !state) {
      this.add.text(640, 360, 'No maps in content/maps yet.', { fontSize: '24px', color: '#fff' }).setOrigin(0.5);
      return;
    }
    this.map = map;
    this.transitioning = false;
    this.justArrived = true;
    this.npcs = [];

    // --- scenery ---
    drawSky(this, map);
    if (!map.interior) {
      map.background.forEach((layer, i) => {
        const key = layer.asset ? `asset:${layer.asset}` : null;
        if (key && this.textures.exists(key)) {
          const src = this.textures.get(key).getSourceImage() as { width: number; height: number };
          const width = layer.repeatX ? 1280 + map.size.width * layer.parallax + src.width : src.width;
          this.add
            .tileSprite(0, layer.y, width, src.height, key)
            .setOrigin(0, 0)
            .setScrollFactor(layer.parallax, 0)
            .setDepth(DEPTH.hillsFar + i);
        } else if (layer.silhouette || !layer.asset) {
          drawHills(this, hex(layer.color, 0x7d92aa), layer.parallax, layer.y || 400, map.size.width, i * 3.1 + map.id.length, DEPTH.hillsFar + i);
        }
      });
    }
    drawGround(this, map);
    for (const p of map.layers.midground) drawPlacement(this, p, DEPTH.midground);
    for (const p of map.layers.ground) drawPlacement(this, p, DEPTH.ground + 1);
    for (const p of map.layers.decor) drawPlacement(this, p, p.y + (p.h ?? 0));
    for (const p of map.layers.foreground) drawPlacement(this, p, DEPTH.foreground);

    for (const slot of mapEntities(map, 'facility_slot')) drawSlot(this, slot.x, slot.y, slot.size, slot.id);
    this.interactables = mapEntities(map, 'interactable');
    for (const it of this.interactables) drawInteractable(this, it.x, it.y, it.w, it.h, it.label ?? it.id);
    this.exits = mapEntities(map, 'exit');
    for (const ex of this.exits) {
      if (ex.direction === 'door') drawInteractable(this, ex.x, ex.y, ex.w, ex.h, ex.label ?? 'Door');
      else {
        const arrow = ex.direction === 'left' ? '◀' : ex.direction === 'right' ? '▶' : '▲';
        this.add
          .text(ex.x + ex.w / 2, ex.y - 20, `${arrow} ${ex.label ?? ex.to.map}`, {
            fontFamily: 'Georgia, serif',
            fontSize: '18px',
            color: '#fff4e0',
            stroke: '#00000099',
            strokeThickness: 4,
          })
          .setOrigin(0.5, 1)
          .setDepth(DEPTH.interactable);
      }
    }

    // --- player ---
    const spawn =
      (this.enter.spawn ? mapEntities(map, 'spawn').find((s) => s.id === this.enter.spawn) : undefined) ??
      mapEntities(map, 'spawn')[0];
    const startX = this.enter.x ?? spawn?.x ?? 200;
    const facing = this.enter.facing ?? spawn?.facing ?? 'right';
    const playerSet = this.pickPlayerSet(state.player.form);
    this.player = this.makeActor('player', playerSet, startX, map.ground_y, facing, state.player.name);
    state.where.map = map.id;
    state.where.x = startX;
    state.where.facing = facing;

    // --- npcs ---
    this.placeNpcs();

    // --- overlays ---
    this.prompt = this.add
      .text(0, 0, '!', {
        fontFamily: 'Georgia, serif',
        fontSize: '40px',
        color: '#fff8e7',
        stroke: '#2a1a10',
        strokeThickness: 6,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.prompt)
      .setVisible(false);
    this.tintRect = this.add
      .rectangle(0, 0, 1280, 720, 0xffffff, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(DEPTH.tint)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.applyTint();

    // --- camera ---
    const cam = this.cameras.main;
    cam.setBounds(0, 0, Math.max(1280, map.size.width), Math.max(720, map.size.height));
    cam.startFollow(this.player.obj, true, 0.12, 0.12);
    cam.fadeIn(220, 0, 0, 0);

    // --- input ---
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys('W,A,S,D,E,SHIFT,ENTER,SPACE') as typeof this.keys;

    // --- bus ---
    this.unsubscribe.forEach((u) => u());
    this.unsubscribe = [
      bus.on('world.enter', (data) => this.switchMap(data)),
      bus.on('content.reloaded', () => this.switchMap({ map: store.state?.where.map ?? map.id, x: this.player.obj.x, facing: this.player.facing })),
      bus.on('time.changed', () => {
        this.applyTint();
        this.placeNpcs();
      }),
      bus.on('npc.refresh', () => this.placeNpcs()),
      bus.on('stage', ({ step, done }) => this.performStage(step, done)),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe.forEach((u) => u());
      this.unsubscribe = [];
    });

    session.onMapEntered(map.id);
  }

  private pickPlayerSet(form: 'masc' | 'fem'): string | null {
    const sprites = store.assets.sprites;
    const wanted = form === 'masc' ? 'player_m' : 'player_f';
    if (sprites[wanted]) return wanted;
    const other = form === 'masc' ? 'player_f' : 'player_m';
    if (sprites[other]) return other;
    return null;
  }

  private makeActor(id: string, set: string | null, x: number, y: number, facing: 'left' | 'right', name: string): Actor {
    if (set && this.textures.exists(`sprite:${set}`)) {
      const info = store.assets.sprites[set]!;
      const sprite = this.add.sprite(x, y, `sprite:${set}`).setOrigin(0.5, info.originY).setScale(CHAR_SCALE).setDepth(y);
      const actor: Actor = { id, obj: sprite, set, facing };
      this.setIdle(actor);
      return actor;
    }
    const c = makePlaceholderCharacter(this, x, y, name).setDepth(y);
    return { id, obj: c, set: null, facing };
  }

  private anim(actor: Actor, name: string): string | null {
    if (!actor.set) return null;
    const key = `${actor.set}:${name}`;
    return this.anims.exists(key) ? key : null;
  }

  private setIdle(actor: Actor): void {
    if (!(actor.obj instanceof Phaser.GameObjects.Sprite)) return;
    const idle = this.anim(actor, 'idle');
    if (idle && actor.id !== 'player') {
      actor.obj.play(idle, true);
      return;
    }
    actor.obj.anims.stop();
    const info = store.assets.sprites[actor.set!];
    const walk = info?.animations[actor.facing === 'left' ? 'leftwalk' : 'rightwalk'];
    if (walk) actor.obj.setFrame(walk.from);
  }

  private setWalking(actor: Actor): void {
    if (!(actor.obj instanceof Phaser.GameObjects.Sprite)) return;
    const key = this.anim(actor, actor.facing === 'left' ? 'leftwalk' : 'rightwalk');
    if (key) actor.obj.play(key, true);
  }

  private placeNpcs(): void {
    for (const n of this.npcs) {
      n.obj.destroy();
      n.bubble?.destroy();
    }
    this.npcs = [];
    if (!store.state) return;
    const ctx = session.ctx();
    for (const { id, at } of charactersOn(ctx, this.map.id)) {
      const profile = store.content.villagers[id]!.profile;
      const set = profile.sprite_set ?? id;
      const actor = this.makeActor(id, store.assets.sprites[set] ? set : null, at.x, this.map.ground_y, at.facing, profile.name);
      actor.bubble = makeBubble(this);
      actor.bubble.setPosition(at.x, this.map.ground_y - this.actorHeight(actor) - 6);
      this.npcs.push(actor);
    }
  }

  private actorHeight(actor: Actor): number {
    if (actor.obj instanceof Phaser.GameObjects.Sprite) return actor.obj.displayHeight * (store.assets.sprites[actor.set!]?.originY ?? 1);
    return 150;
  }

  private applyTint(): void {
    if (!this.tintRect || !store.state) return;
    if (this.map.interior) {
      this.tintRect.setFillStyle(0xffffff, 0);
      return;
    }
    const custom = this.map.ambience.tint?.[store.state.time.phase];
    const def = PHASE_TINT[store.state.time.phase];
    if (custom) this.tintRect.setFillStyle(hex(custom, 0xffffff), def?.alpha ?? 0.4);
    else if (def) this.tintRect.setFillStyle(def.color, def.alpha);
    else this.tintRect.setFillStyle(0xffffff, 0);
  }

  private switchMap(data: EnterWorldData): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(160, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart(data);
    });
  }

  // --- stage directions -----------------------------------------------------

  private findActor(who: unknown): Actor | undefined {
    if (who === 'player') return this.player;
    return this.npcs.find((n) => n.id === who);
  }

  private spotX(id: unknown): number | undefined {
    return mapEntities(this.map, 'npc_spot').find((s) => s.id === id)?.x;
  }

  private performStage(step: StageStep, done: () => void): void {
    const a = step.args;
    switch (step.op) {
      case 'place': {
        let actor = this.findActor(a.who);
        const x = this.spotX(a.at);
        if (x === undefined) return done();
        if (!actor && typeof a.who === 'string' && store.content.villagers[a.who]) {
          const profile = store.content.villagers[a.who]!.profile;
          const set = profile.sprite_set ?? a.who;
          actor = this.makeActor(a.who, store.assets.sprites[set] ? set : null, x, this.map.ground_y, 'left', profile.name);
          actor.bubble = makeBubble(this);
          this.npcs.push(actor);
        }
        if (actor) {
          actor.obj.setPosition(x, this.map.ground_y);
          actor.bubble?.setPosition(x, this.map.ground_y - this.actorHeight(actor) - 6);
        }
        return done();
      }
      case 'move': {
        const actor = this.findActor(a.who);
        const x = this.spotX(a.to);
        if (!actor || x === undefined) return done();
        actor.facing = x < actor.obj.x ? 'left' : 'right';
        this.setWalking(actor);
        const speed = a.speed === 'run' ? RUN_SPEED : WALK_SPEED;
        const duration = (Math.abs(x - actor.obj.x) / speed) * 1000;
        const finish = () => {
          this.setIdle(actor);
          actor.bubble?.setPosition(actor.obj.x, this.map.ground_y - this.actorHeight(actor) - 6);
          if (actor === this.player && store.state) store.state.where.x = actor.obj.x;
        };
        this.tweens.add({
          targets: actor.obj,
          x,
          duration,
          onComplete: () => {
            finish();
            if (a.wait !== false) done();
          },
        });
        if (a.wait === false) done();
        return;
      }
      case 'face': {
        const actor = this.findActor(a.who);
        if (actor) {
          if (typeof a.dir === 'string') actor.facing = a.dir as 'left' | 'right';
          else {
            const target = this.findActor(a.toward);
            if (target) actor.facing = target.obj.x < actor.obj.x ? 'left' : 'right';
          }
          this.setIdle(actor);
        }
        return done();
      }
      case 'emote': {
        const actor = this.findActor(a.who);
        if (actor) {
          const icon = String(a.icon);
          const glyph = icon === 'heart' ? '♥' : icon === 'anger' ? '💢' : icon === 'sweat' ? '💧' : icon === 'note' ? '♪' : icon === 'zzz' ? 'z' : icon;
          const t = this.add
            .text(actor.obj.x, this.map.ground_y - this.actorHeight(actor) - 10, glyph, {
              fontFamily: 'Georgia, serif',
              fontSize: '36px',
              color: '#fff8e7',
              stroke: '#2a1a10',
              strokeThickness: 5,
            })
            .setOrigin(0.5, 1)
            .setDepth(DEPTH.prompt);
          this.tweens.add({ targets: t, y: t.y - 24, alpha: 0, duration: 900, delay: 300, onComplete: () => t.destroy() });
        }
        return done();
      }
      case 'wait':
        this.time.delayedCall(Number(a.value ?? 0.5) * 1000, done);
        return;
      case 'fade': {
        const dir = typeof a.value === 'string' ? a.value : (a.dir as string | undefined) ?? 'in';
        const seconds = Number(a.seconds ?? 0.4);
        if (dir === 'out') this.cameras.main.fadeOut(seconds * 1000, 0, 0, 0, (_c: unknown, p: number) => p === 1 && done());
        else this.cameras.main.fadeIn(seconds * 1000, 0, 0, 0, (_c: unknown, p: number) => p === 1 && done());
        return;
      }
      case 'camera': {
        const cam = this.cameras.main;
        if (typeof a.shake === 'number') cam.shake(a.shake * 1000, 0.008);
        if (a.focus !== undefined) {
          const actor = this.findActor(a.focus);
          if (actor) cam.startFollow(actor.obj, true, 0.08, 0.08);
        }
        if (a.pan !== undefined) {
          const x = this.spotX(a.pan);
          if (x !== undefined) {
            cam.stopFollow();
            cam.pan(x, cam.midPoint.y, 600, 'Sine.easeInOut', false, (_c: unknown, p: number) => p === 1 && done());
            return;
          }
        }
        return done();
      }
      case 'anim': {
        const actor = this.findActor(a.who);
        const key = actor ? this.anim(actor, String(a.play)) : null;
        if (actor && key && actor.obj instanceof Phaser.GameObjects.Sprite) actor.obj.play(key, true);
        return done();
      }
      default:
        return done();
    }
  }

  // --- per frame --------------------------------------------------------------

  override update(time: number, delta: number): void {
    const state = store.state;
    if (!state || !this.player || this.transitioning) return;
    const canAct = store.ui.mode === 'world';
    const p = this.player;

    let dir = 0;
    if (canAct) {
      const left = this.cursors.left.isDown || this.keys.A.isDown;
      const right = this.cursors.right.isDown || this.keys.D.isDown;
      dir = (right ? 1 : 0) - (left ? 1 : 0);
    }
    if (dir !== 0) {
      p.facing = dir < 0 ? 'left' : 'right';
      const speed = (this.keys.SHIFT.isDown ? RUN_SPEED : WALK_SPEED) * (delta / 1000);
      const nx = Phaser.Math.Clamp(p.obj.x + dir * speed, 40, this.map.size.width - 40);
      if (!this.blocked(nx)) p.obj.x = nx;
      this.setWalking(p);
    } else if (p.obj instanceof Phaser.GameObjects.Sprite && p.obj.anims.isPlaying) {
      this.setIdle(p);
    }
    p.obj.setDepth(p.obj.y);
    state.where.x = p.obj.x;
    state.where.facing = p.facing;

    // proximity
    const px = p.obj.x;
    let nearest: Actor | undefined;
    let nearestD = TALK_RANGE;
    for (const n of this.npcs) {
      const d = Math.abs(n.obj.x - px);
      n.bubble?.setVisible(false);
      if (d < nearestD) {
        nearestD = d;
        nearest = n;
      }
    }
    const inter = this.interactables.find((it) => px >= it.x - 12 && px <= it.x + it.w + 12);
    const exit = this.exits.find((ex) => px >= ex.x - 6 && px <= ex.x + ex.w + 6);
    if (!exit) this.justArrived = false;

    if (nearest && canAct) nearest.bubble?.setVisible(true);
    const bob = Math.sin(time / 180) * 4;
    const headY = this.map.ground_y - this.actorHeight(p) - 6 + bob;
    if (canAct && inter && !nearest) {
      this.prompt.setText('!').setPosition(px, headY).setVisible(true);
    } else if (canAct && exit && !nearest && !isAutoExit(exit)) {
      this.prompt.setText(EXIT_ARROWS[exit.direction]).setPosition(px, headY).setVisible(true);
    } else {
      this.prompt.setVisible(false);
    }

    if (!canAct) return;

    if (exit && !this.justArrived && isAutoExit(exit)) {
      if (session.useExit(exit)) this.transitioning = true;
      return;
    }

    const pressed =
      Phaser.Input.Keyboard.JustDown(this.keys.E) ||
      Phaser.Input.Keyboard.JustDown(this.keys.ENTER) ||
      Phaser.Input.Keyboard.JustDown(this.keys.SPACE);
    if (!pressed) return;
    if (nearest) {
      const npc = nearest;
      npc.facing = px < npc.obj.x ? 'left' : 'right';
      this.setIdle(npc);
      session.talkTo(npc.id);
    } else if (inter) {
      session.interact(inter);
    } else if (exit) {
      if (session.useExit(exit)) this.transitioning = true;
    }
  }

  private blocked(nx: number): boolean {
    const feet = this.map.ground_y;
    for (const r of this.map.collision) {
      if (r.y > feet || r.y + r.h < feet - 40) continue;
      if (nx + 18 > r.x && nx - 18 < r.x + r.w) return true;
    }
    return false;
  }
}
