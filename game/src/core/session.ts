// The session is the single entry point the UI and scenes use to act on the game.
import {
  DAYS_PER_WEEK,
  DEFAULT_GIFT_POINTS,
  NOT_INTERESTED_LINE,
  mapEntities,
  tierForPoints,
} from '@withergate/shared';
import type {
  EntityOf,
  GiftCategory,
  HeartEvent,
  Script,
  StageStep,
  Step,
  Topic,
} from '@withergate/shared';
import { bus } from '../bridge/bus';
import { store } from '../bridge/store';
import type { BattleView, DialogChoice, DialogLine, PanelKind, UiMode } from '../bridge/store';
import { applyDefeat, playerAct, startBattle } from './combat/battle';
import type { BattleAction, BattleEvent, BattleResult, BattleSource } from './combat/battle';
import { evaluate } from './conditions';
import type { CoreRequest, Ctx } from './ctx';
import { Interpreter } from './dialog/interpreter';
import type { InterpreterOutput } from './dialog/interpreter';
import { pickLine } from './dialog/pools';
import { applyEffects, recruit } from './effects';
import { checkQuests } from './quests';
import { changeFriendship, introduce } from './relationships';
import { listSlots, loadSlot, saveToSlot } from './save';
import { newGame, residents, villagerState } from './state';
import type { GameState, NewGameOptions } from './state';
import { advancePhases, sleepUntilMorning } from './time';

type DoneMode = 'menu' | 'close' | 'scene' | 'natural';

/** How long each combat event stays on screen before the next one plays. */
const EVENT_DELAY: Partial<Record<BattleEvent['type'], number>> = {
  start: 700,
  round: 350,
  line: 1000,
  enemy_move: 450,
  power: 450,
  hit: 600,
  miss: 500,
  heal: 500,
  status: 500,
  status_tick: 450,
  status_end: 300,
  skip: 550,
  defend: 400,
  grace: 250,
  intercept: 650,
  flee: 800,
  spare: 800,
  end: 900,
};

class Session {
  private interp: Interpreter | null = null;
  private onDone: ((mode: DoneMode) => void) | null = null;
  private queued: (() => void)[] = [];
  /** The ctx the running script shares, so effects and the requests they queue reach one place. */
  private dialogCtx: Ctx | null = null;
  // battle bookkeeping
  private battleCtx: Ctx | null = null;
  private battleFromInterp = false;
  private battleHandlesLoss = false;
  private battleAfter: { onWin?: Step[]; onLose?: Step[] } | null = null;
  private battleReturnMode: UiMode = 'world';
  private battlePending: BattleEvent[] = [];
  private battleDraining = false;
  private battleTimer: number | null = null;

  // -- context ---------------------------------------------------------------

  ctx(speaker?: string): Ctx {
    return {
      state: store.state!,
      content: store.content,
      rng: store.rng,
      speaker,
      notify: (t) => store.toast(t),
      requests: [],
    };
  }

  private flush(ctx: Ctx): void {
    const requests = ctx.requests.splice(0);
    for (const r of requests) this.handleRequest(r);
    checkQuests(ctx);
    store.commit();
  }

  private handleRequest(r: CoreRequest): void {
    switch (r.kind) {
      case 'teleport': {
        const map = store.content.maps[r.map];
        const spawn = map ? mapEntities(map, 'spawn').find((s) => s.id === r.spawn) : undefined;
        if (!map || !spawn) return;
        store.state!.where = { map: r.map, x: spawn.x, facing: spawn.facing };
        this.after(() => bus.emit('world.enter', { map: r.map, spawn: r.spawn }));
        break;
      }
      case 'cutscene':
        this.after(() => this.runCutscene(r.id));
        break;
      case 'event': {
        const ev = this.findEvent(r.id);
        if (ev) this.after(() => this.playEvent(ev));
        break;
      }
      case 'battle':
        this.after(() => this.startBattle(r.enemy, { source: 'script', onWin: r.on_win, onLose: r.on_lose }));
        break;
      case 'time_changed':
        bus.emit('time.changed');
        break;
      case 'npc_refresh':
        bus.emit('npc.refresh');
        break;
      default:
        break;
    }
  }

  /** Run now if no dialog is active, otherwise after the current one finishes. */
  private after(fn: () => void): void {
    if (this.interp) this.queued.push(fn);
    else fn();
  }

  // -- lifecycle -------------------------------------------------------------

  assetsReady(): void {
    store.assetsReady = true;
    // Dev shortcut used by the editor's "Play from here": ?map=<id>&spawn=<id>
    const params = new URLSearchParams(window.location.search);
    const map = params.get('map');
    if (import.meta.env.DEV && map && store.content.maps[map] && store.ui.mode === 'boot') {
      this.newGame({
        name: 'Wanderer',
        form: 'fem',
        label: 'cool',
        stats: { charisma: 5, intelligence: 5, luck: 5, dexterity: 5, perception: 5 },
        startMap: map,
        startSpawn: params.get('spawn') ?? undefined,
        skipOpening: true,
      });
      return;
    }
    if (store.ui.mode === 'boot') store.updateUi({ mode: 'title' });
    else store.commit();
  }

  uiState() {
    return store.ui;
  }

  startCreation(): void {
    store.updateUi({ mode: 'creation' });
  }

  backToTitle(): void {
    store.updateUi({ mode: 'title' });
  }

  /** Start a new game. The opening cutscene plays on the landing map unless skipOpening is set. */
  newGame(opts: NewGameOptions & { skipOpening?: boolean }): void {
    const opening = store.content.cutscenes.opening;
    const landing = opening?.stage?.map && store.content.maps[opening.stage.map] ? opening.stage.map : null;
    const state = newGame(store.content, {
      ...opts,
      startMap: opts.startMap ?? (!opts.skipOpening && landing ? landing : undefined),
    });
    if (!opts.skipOpening && landing && !opts.startMap) state.flags.opening_pending = true;
    this.enterGame(state);
  }

  quickStart(): void {
    this.newGame({
      name: 'Wanderer',
      form: 'fem',
      label: 'cool',
      stats: { charisma: 5, intelligence: 5, luck: 5, dexterity: 5, perception: 5 },
      skipOpening: true,
    });
    // Dev convenience: a couple of powers so combat can be tried without the skill tree.
    const p = store.state?.player;
    if (p) {
      for (const id of ['smite', 'mending_light']) {
        if (!store.content.powers[id]) continue;
        if (!p.powers.includes(id)) p.powers.push(id);
        if (!p.equippedPowers.includes(id) && p.equippedPowers.length < 4) p.equippedPowers.push(id);
      }
      store.commit();
    }
  }

  load(slot: number): boolean {
    const state = loadSlot(slot);
    if (!state) return false;
    this.enterGame(state);
    return true;
  }

  private enterGame(state: GameState): void {
    this.interp = null;
    this.onDone = null;
    this.dialogCtx = null;
    this.queued = [];
    this.resetBattle();
    store.setState(state);
    store.updateUi({ mode: 'world', panel: null, talk: null, line: null, choices: null, roll: null, dialogActive: false, battle: null });
    bus.emit('world.enter', { map: state.where.map, x: state.where.x, facing: state.where.facing });
  }

  save(slot: number): void {
    if (!store.state) return;
    store.commit();
    saveToSlot(slot, store.state);
    store.toast(`Saved to slot ${slot}.`);
  }

  sleepAndSave(slot: number): void {
    const ctx = this.ctx();
    sleepUntilMorning(ctx);
    this.flush(ctx);
    saveToSlot(slot, store.state!);
    store.toast(`A new day. Saved to slot ${slot}.`);
    this.closePanel();
    this.onMapEntered(store.state!.where.map);
  }

  slots() {
    return listSlots();
  }

  // -- panels ----------------------------------------------------------------

  openPanel(kind: PanelKind): void {
    store.updateUi({ mode: 'panel', panel: kind });
  }

  closePanel(): void {
    store.updateUi({ mode: 'world', panel: null });
  }

  toggleDebug(): void {
    store.updateUi({ debugOpen: !store.ui.debugOpen });
  }

  private setWorld(): void {
    store.updateUi({ mode: 'world', talk: null, panel: null });
    this.drainQueue();
  }

  private drainQueue(): void {
    const next = this.queued.shift();
    if (next) next();
  }

  // -- world interactions ----------------------------------------------------

  interact(entity: EntityOf<'interactable'>): void {
    const ctx = this.ctx();
    if (entity.requires && !evaluate(entity.requires, ctx)) {
      store.toast('Not now.');
      return;
    }
    const a = entity.action;
    switch (a.kind) {
      case 'open_ui':
        this.openPanel(a.ui);
        break;
      case 'sign':
        this.runSteps([{ kind: 'line', speaker: 'narrate', text: a.text }], `sign:${entity.id}`);
        break;
      case 'run_script': {
        const s = store.content.shared[a.script];
        if (s) this.runScript(s, a.script, undefined, () => this.setWorld());
        break;
      }
      case 'forage': {
        const key = `forage:${ctx.state.where.map}:${entity.id}`;
        if (a.once_per_day && ctx.state.flags[key] === ctx.state.time.day) {
          this.runSteps([{ kind: 'line', speaker: 'narrate', text: 'Nothing more to gather here today.' }], key);
          return;
        }
        const amount = ctx.rng.int(a.amount[0], a.amount[1]);
        ctx.state.town.resources[a.resource] += amount;
        ctx.state.flags[key] = ctx.state.time.day;
        this.flush(ctx);
        this.runSteps([{ kind: 'line', speaker: 'narrate', text: `You gather ${amount} ${a.resource}.` }], key);
        break;
      }
      case 'facility':
        this.openPanel('build');
        break;
      default:
        break;
    }
  }

  useExit(exit: EntityOf<'exit'>): boolean {
    const ctx = this.ctx();
    if (exit.requires && !evaluate(exit.requires, ctx)) {
      store.toast('Not now.');
      return false;
    }
    const map = store.content.maps[exit.to.map];
    const spawn = map ? mapEntities(map, 'spawn').find((s) => s.id === exit.to.spawn) : undefined;
    if (!map || !spawn) {
      store.toast(`Map "${exit.to.map}" is not built yet.`);
      return false;
    }
    ctx.state.where = { map: exit.to.map, x: spawn.x, facing: spawn.facing };
    store.commit();
    bus.emit('world.enter', { map: exit.to.map, spawn: exit.to.spawn });
    return true;
  }

  /** Place the stage's actors and run a cutscene on the current map. */
  runCutscene(id: string): void {
    const c = store.content.cutscenes[id];
    if (!c || !store.state) return;
    for (const [who, at] of Object.entries(c.stage?.place ?? {})) {
      bus.emit('stage', { step: { kind: 'stage', op: 'place', args: { who, at } }, done: () => undefined });
    }
    store.updateUi({ mode: 'dialog', talk: null });
    this.runScript(c.script, `cutscene:${id}`, undefined, () => this.setWorld());
  }

  /** A trigger zone was entered. Returns true when something started. */
  fireTrigger(t: EntityOf<'trigger'>): boolean {
    if (!store.state || this.interp) return false;
    const ctx = this.ctx();
    const key = `trigger:${ctx.state.where.map}:${t.id}`;
    if (t.once && ctx.state.flags[key]) return false;
    if (t.requires && !evaluate(t.requires, ctx)) return false;
    ctx.state.flags[key] = true;
    store.commit();
    switch (t.action.kind) {
      case 'run_script': {
        const s = store.content.shared[t.action.script];
        if (!s) return false;
        store.updateUi({ mode: 'dialog', talk: null });
        this.runScript(s, t.action.script, undefined, () => this.setWorld());
        return true;
      }
      case 'start_event': {
        const ev = this.findEvent(t.action.event);
        if (!ev) return false;
        this.playEvent(ev);
        return true;
      }
      case 'start_cutscene':
        this.runCutscene(t.action.cutscene);
        return true;
      default:
        return false;
    }
  }

  /** Called by the world scene once a map is built; runs the opening, quest checks and enter_map heart events. */
  onMapEntered(mapId: string): void {
    if (!store.state || this.interp) return;
    const ctx = this.ctx();
    if (ctx.state.flags.opening_pending) {
      delete ctx.state.flags.opening_pending;
      this.flush(ctx);
      this.runCutscene('opening');
      return;
    }
    this.flush(ctx);
    const candidates: HeartEvent[] = [];
    for (const v of Object.values(store.content.villagers)) {
      for (const ev of v.events) {
        if (ev.trigger.on !== 'enter_map') continue;
        const rel = villagerState(ctx.state, ctx.content, ev.villager);
        if (rel.gone) continue;
        if (ev.trigger.once && rel.eventsSeen.includes(ev.id)) continue;
        if (ev.stage?.map && ev.stage.map !== mapId) continue;
        if (!evaluate(ev.trigger.requires, { ...ctx, speaker: ev.villager })) continue;
        candidates.push(ev);
      }
    }
    if (!candidates.length) return;
    candidates.sort((a, b) => b.trigger.priority - a.trigger.priority);
    this.playEvent(candidates[0]!);
  }

  private findEvent(id: string): HeartEvent | undefined {
    for (const v of Object.values(store.content.villagers)) {
      const ev = v.events.find((e) => e.id === id);
      if (ev) return ev;
    }
    return undefined;
  }

  private playEvent(ev: HeartEvent): void {
    const rel = villagerState(store.state!, store.content, ev.villager);
    if (!rel.eventsSeen.includes(ev.id)) rel.eventsSeen.push(ev.id);
    introduce(this.ctx(ev.villager), ev.villager);
    if (ev.stage?.place) {
      for (const [who, at] of Object.entries(ev.stage.place)) {
        bus.emit('stage', { step: { kind: 'stage', op: 'place', args: { who, at } }, done: () => undefined });
      }
    }
    store.updateUi({ mode: 'dialog', talk: null });
    this.runScript(ev.script, `event:${ev.id}`, ev.villager, () => this.setWorld());
  }

  // -- talking ---------------------------------------------------------------

  talkTo(id: string): void {
    if (!store.state || !store.content.villagers[id]) return;
    const ctx = this.ctx(id);
    introduce(ctx, id);
    this.flush(ctx);
    store.updateUi({ mode: 'dialog', talk: { villager: id, view: 'menu' } });
    // talk-triggered heart events play before the menu
    const rel = villagerState(store.state, store.content, id);
    const ev = store.content.villagers[id]!.events
      .filter((e) => e.trigger.on === 'talk' && !(e.trigger.once && rel.eventsSeen.includes(e.id)))
      .filter((e) => evaluate(e.trigger.requires, ctx))
      .sort((a, b) => b.trigger.priority - a.trigger.priority)[0];
    if (ev) {
      if (!rel.eventsSeen.includes(ev.id)) rel.eventsSeen.push(ev.id);
      this.runScript(ev.script, `event:${ev.id}`, id, (mode) => (mode === 'close' || mode === 'scene' ? this.exitTalk() : this.showMenu()));
    }
  }

  private showMenu(): void {
    if (!store.ui.talk) {
      this.setWorld();
      return;
    }
    store.updateUi({ mode: 'dialog', talk: { ...store.ui.talk, view: 'menu' } });
  }

  setTalkView(view: 'menu' | 'topics' | 'gifts'): void {
    if (!store.ui.talk) return;
    store.updateUi({ talk: { ...store.ui.talk, view } });
  }

  exitTalk(): void {
    this.interp = null;
    this.onDone = null;
    this.dialogCtx = null;
    store.updateUi({ mode: 'world', talk: null, line: null, choices: null, roll: null, dialogActive: false });
    this.drainQueue();
  }

  chat(): void {
    const id = store.ui.talk?.villager;
    if (!id) return;
    const ctx = this.ctx(id);
    const v = store.content.villagers[id]!;
    const rel = villagerState(ctx.state, ctx.content, id);
    const picked = pickLine(v.chat, ctx, rel.recentChat);
    if (rel.chattedDay !== ctx.state.time.day) {
      rel.chattedDay = ctx.state.time.day;
      changeFriendship(ctx, id, 1);
    }
    let steps: Step[];
    if (picked) {
      rel.recentChat = [...rel.recentChat, picked.key].slice(-3);
      steps = picked.steps;
    } else {
      steps = [{ kind: 'line', speaker: id, text: `[PLACEHOLDER: no chat line for ${v.profile.name} in this state]` }];
    }
    this.flush(ctx);
    this.runSteps(steps, `chat:${id}`, id, (mode) => (mode === 'close' ? this.exitTalk() : this.showMenu()));
  }

  availableTopics(id: string): (Topic & { recruit?: boolean })[] {
    const ctx = this.ctx(id);
    const v = store.content.villagers[id];
    if (!v || !store.state) return [];
    const rel = villagerState(ctx.state, ctx.content, id);
    const topics: (Topic & { recruit?: boolean })[] = v.discuss.filter((t) => {
      if (rel.topicsDone.includes(t.id) && !t.repeatable) return false;
      return evaluate(t.requires, ctx);
    });
    const r = v.profile.recruit;
    if (r && !rel.resident && !rel.gone && residents(ctx.state).length < 10 && evaluate(r.requires, ctx)) {
      const exhausted = r.method.kind === 'chance' && rel.recruitAttempts >= r.method.max_attempts;
      if (!exhausted) {
        topics.push({
          id: '__recruit',
          label: v.recruit?.topic_label ?? 'Come to Withergate',
          marker: 'quest',
          once: false,
          repeatable: true,
          cost: 'none',
          script: v.recruit?.script ?? { nodes: { start: [] } },
          recruit: true,
        });
      }
    }
    return topics;
  }

  discuss(topicId: string): void {
    const id = store.ui.talk?.villager;
    if (!id) return;
    const topic = this.availableTopics(id).find((t) => t.id === topicId);
    if (!topic) return;
    if (topic.recruit) {
      this.runRecruit(id, topic.script);
      return;
    }
    const ctx = this.ctx(id);
    const rel = villagerState(ctx.state, ctx.content, id);
    this.runScript(topic.script, `topic:${id}:${topic.id}`, id, (mode) => {
      if (!rel.topicsDone.includes(topic.id)) rel.topicsDone.push(topic.id);
      if (topic.cost === 'phase') {
        const c = this.ctx(id);
        advancePhases(c, 1);
        this.flush(c);
      }
      store.commit();
      if (mode === 'close') this.exitTalk();
      else this.showMenu();
    });
  }

  private runRecruit(id: string, script: Script): void {
    const bundle = store.content.villagers[id]!;
    const method = bundle.profile.recruit!.method;
    const name = bundle.profile.name;
    const outcome = (): Step[] => {
      const ctx = this.ctx(id);
      const rel = villagerState(ctx.state, ctx.content, id);
      let ok = false;
      let text = '';
      switch (method.kind) {
        case 'ask':
          ok = true;
          break;
        case 'chance': {
          rel.recruitAttempts += 1;
          ok = ctx.rng.chance(method.chance);
          const left = method.max_attempts - rel.recruitAttempts;
          if (!ok) text = left > 0 ? `${name} is not convinced yet. (${left} more ${left === 1 ? 'try' : 'tries'})` : `${name} has made up their mind. They will not come.`;
          break;
        }
        case 'quest': {
          ok = ctx.state.quests[method.quest]?.status === 'done';
          if (!ok) text = `${name} wants "${ctx.content.quests[method.quest]?.title ?? method.quest}" settled first.`;
          break;
        }
        case 'item': {
          const have = ctx.state.town.storage[method.item] ?? 0;
          ok = have >= method.amount;
          if (ok) {
            ctx.state.town.storage[method.item] = have - method.amount;
            if (ctx.state.town.storage[method.item]! <= 0) delete ctx.state.town.storage[method.item];
          } else {
            text = `${name} asks for ${method.amount} × ${ctx.content.items[method.item]?.name ?? method.item} first.`;
          }
          break;
        }
        default:
          break;
      }
      if (ok) {
        recruit(ctx, id);
        text = `${name} agrees to move to Withergate.`;
      }
      this.flush(ctx);
      return [{ kind: 'line', speaker: 'narrate', text }];
    };
    this.runScript(script, `recruit:${id}`, id, () => {
      this.runSteps(outcome(), `recruit_outcome:${id}`, id, (mode) => (mode === 'close' ? this.exitTalk() : this.showMenu()));
    });
  }

  flirt(): void {
    const id = store.ui.talk?.villager;
    if (!id) return;
    const ctx = this.ctx(id);
    const v = store.content.villagers[id]!;
    const rel = villagerState(ctx.state, ctx.content, id);
    let steps: Step[];
    if (!v.profile.romanceable) {
      steps = [{ kind: 'line', speaker: id, text: NOT_INTERESTED_LINE }];
    } else {
      const picked = pickLine(v.flirt, ctx, []);
      if (picked) {
        steps = picked.steps;
        if (rel.flirtedDay !== ctx.state.time.day) {
          rel.flirtedDay = ctx.state.time.day;
          applyEffects(picked.effects, ctx);
        }
      } else {
        steps = [{ kind: 'line', speaker: id, text: `[PLACEHOLDER: no flirt response for ${v.profile.name} in this state]` }];
      }
    }
    this.flush(ctx);
    this.runSteps(steps, `flirt:${id}`, id, (mode) => (mode === 'close' ? this.exitTalk() : this.showMenu()));
  }

  giftOptions(): { id: string; name: string; count: number; source: 'satchel' | 'storage' }[] {
    const s = store.state;
    if (!s) return [];
    const out: { id: string; name: string; count: number; source: 'satchel' | 'storage' }[] = [];
    const counts = new Map<string, number>();
    for (const id of s.player.satchel) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, n] of counts) out.push({ id, name: store.content.items[id]?.name ?? id, count: n, source: 'satchel' });
    if (store.content.maps[s.where.map]?.town === 'withergate') {
      for (const [id, n] of Object.entries(s.town.storage)) {
        if (n > 0 && store.content.items[id]?.kind === 'gift') out.push({ id, name: store.content.items[id]!.name, count: n, source: 'storage' });
      }
    }
    return out;
  }

  giveGift(itemId: string, source: 'satchel' | 'storage'): void {
    const id = store.ui.talk?.villager;
    if (!id) return;
    const ctx = this.ctx(id);
    const v = store.content.villagers[id]!;
    const rel = villagerState(ctx.state, ctx.content, id);
    // One gift per character per week (decided F7).
    if (rel.giftedDay > 0 && ctx.state.time.day - rel.giftedDay < DAYS_PER_WEEK) {
      const wait = DAYS_PER_WEEK - (ctx.state.time.day - rel.giftedDay);
      this.runSteps(
        [{ kind: 'line', speaker: 'narrate', text: `You already gave ${v.profile.name} something this week. (${wait} day${wait === 1 ? '' : 's'} to go)` }],
        `gift:${id}`,
        id,
        () => this.showMenu(),
      );
      return;
    }
    // consume
    if (source === 'satchel') {
      const i = ctx.state.player.satchel.indexOf(itemId);
      if (i < 0) return;
      ctx.state.player.satchel.splice(i, 1);
    } else {
      const have = ctx.state.town.storage[itemId] ?? 0;
      if (have <= 0) return;
      if (have === 1) delete ctx.state.town.storage[itemId];
      else ctx.state.town.storage[itemId] = have - 1;
    }
    rel.giftedDay = ctx.state.time.day;
    const category = giftCategory(v.profile.gifts, itemId);
    const gctx: Ctx = { ...ctx, extras: { gift_category: category } };
    const override = (v.gifts.overrides[itemId] ?? []).find((o) => evaluate(o.when, gctx));
    const lines = override?.lines ?? v.gifts.reactions[category];
    const steps: Step[] = lines?.length
      ? ctx.rng.pick(lines)
      : [{ kind: 'line', speaker: id, text: `[PLACEHOLDER: ${v.profile.name} has no ${category} gift reaction]` }];
    const effects = override?.effects ?? {
      friendship: DEFAULT_GIFT_POINTS[category],
      romance: category === 'loved' && v.profile.romanceable ? 3 : undefined,
    };
    applyEffects(effects, gctx);
    this.flush(gctx);
    store.updateUi({ talk: { villager: id, view: 'menu' } });
    this.runSteps(steps, `gift:${id}:${itemId}`, id, (mode) => (mode === 'close' ? this.exitTalk() : this.showMenu()));
  }

  // -- battle ----------------------------------------------------------------

  /**
   * Start a fight. From a running script the script resumes with its on_win / on_lose branch
   * afterwards; otherwise the optional onWin / onLose steps run as their own script.
   */
  startBattle(
    enemyId: string,
    opts: { source: BattleSource; fromInterp?: boolean; handlesLoss?: boolean; onWin?: Step[]; onLose?: Step[] },
  ): boolean {
    if (!store.state || store.state.battle) return false;
    if (!store.content.enemies[enemyId]) {
      store.toast(`Unknown enemy "${enemyId}".`);
      return false;
    }
    this.battleFromInterp = !!opts.fromInterp;
    this.battleHandlesLoss = !!opts.handlesLoss || !!opts.onLose;
    this.battleAfter = { onWin: opts.onWin, onLose: opts.onLose };
    this.battleReturnMode = store.ui.mode === 'dialog' ? 'dialog' : 'world';
    const ctx = opts.fromInterp && this.dialogCtx ? this.dialogCtx : this.ctx();
    this.battleCtx = ctx;
    const events = startBattle(ctx, enemyId, opts.source);
    store.updateUi({ mode: 'battle', battle: { log: [], busy: true, view: 'main' } });
    bus.emit('battle.start', { enemy: enemyId });
    this.queueBattleEvents(events);
    return true;
  }

  /** The player's action for this turn; ignored while events are still animating. */
  battleAct(action: BattleAction): void {
    const b = store.state?.battle;
    if (!b || !this.battleCtx || b.phase !== 'active' || !b.awaitingInput || store.ui.battle?.busy) return;
    const events = playerAct(this.battleCtx, action);
    if (!events.length) return;
    store.updateUi({ battle: { ...store.ui.battle!, busy: true, view: 'main' } });
    this.queueBattleEvents(events);
  }

  setBattleView(view: BattleView['view']): void {
    if (!store.ui.battle) return;
    store.updateUi({ battle: { ...store.ui.battle, view } });
  }

  private queueBattleEvents(events: BattleEvent[]): void {
    this.battlePending.push(...events);
    if (!this.battleDraining) this.drainBattle();
  }

  private drainBattle(): void {
    const ev = this.battlePending.shift();
    if (!ev) {
      this.battleDraining = false;
      this.afterBattleEvents();
      return;
    }
    this.battleDraining = true;
    if (store.ui.battle) store.updateUi({ battle: { ...store.ui.battle, log: [...store.ui.battle.log, ev].slice(-10) } });
    else store.commit();
    bus.emit('battle.event', ev);
    this.battleTimer = window.setTimeout(() => this.drainBattle(), EVENT_DELAY[ev.type] ?? 450);
  }

  private afterBattleEvents(): void {
    const b = store.state?.battle;
    if (!b) return;
    if (b.phase === 'active') {
      if (store.ui.battle) store.updateUi({ battle: { ...store.ui.battle, busy: false } });
      return;
    }
    this.finishBattle(b.phase);
  }

  private finishBattle(result: BattleResult): void {
    const ctx = this.battleCtx ?? this.ctx();
    const won = result === 'won' || result === 'spared';
    const fromInterp = this.battleFromInterp && !!this.interp;
    const after = this.battleAfter;
    const handlesLoss = this.battleHandlesLoss;
    const returnMode = this.battleReturnMode;
    store.state!.battle = null;
    this.resetBattle();
    bus.emit('battle.end', { result });
    store.updateUi({ mode: fromInterp ? 'dialog' : returnMode, battle: null });
    if (!won && !handlesLoss) applyDefeat(ctx);
    if (fromInterp) {
      this.interp!.resolveBattle(won);
      this.pump(ctx);
      return;
    }
    this.flush(ctx);
    const steps = won ? after?.onWin : after?.onLose;
    if (steps?.length) this.runSteps(steps, `battle:${result}`, undefined, () => this.setWorld());
    else if (store.ui.mode === 'dialog' && !this.interp) this.setWorld();
  }

  private resetBattle(): void {
    if (this.battleTimer !== null) window.clearTimeout(this.battleTimer);
    this.battleTimer = null;
    this.battlePending = [];
    this.battleDraining = false;
    this.battleCtx = null;
    this.battleFromInterp = false;
    this.battleHandlesLoss = false;
    this.battleAfter = null;
  }

  // -- dialog engine ---------------------------------------------------------

  runSteps(steps: Step[], id: string, speaker?: string, onDone?: (mode: DoneMode) => void): void {
    this.runScript({ nodes: { start: steps } }, id, speaker, onDone);
  }

  runScript(script: Script, id: string, speaker?: string, onDone?: (mode: DoneMode) => void): void {
    const ctx = this.ctx(speaker);
    this.dialogCtx = ctx;
    this.interp = new Interpreter(ctx, script, id);
    this.onDone = onDone ?? (() => this.setWorld());
    store.updateUi({ mode: 'dialog', line: null, choices: null, roll: null });
    this.pump(ctx);
  }

  private pump(ctx: Ctx, out?: InterpreterOutput): void {
    const interp = this.interp;
    if (!interp) return;
    const o = out ?? interp.next();
    switch (o.type) {
      case 'line':
        store.updateUi({ line: this.toLine(o.step.speaker, o.text, o.step.mood, o.step.loc), choices: null, roll: null, dialogActive: true });
        break;
      case 'choice': {
        const choices: DialogChoice[] = o.options.map((c) => ({
          index: c.index,
          text: c.option.text,
          locked: c.locked,
          lockedText: c.option.locked_text,
        }));
        store.updateUi({ choices, roll: null, dialogActive: true });
        break;
      }
      case 'roll':
        store.updateUi({
          roll: { stat: o.stat, roll: o.result.roll, total: o.result.total, dc: o.result.dc, outcome: o.result.outcome },
          choices: null,
          dialogActive: true,
        });
        break;
      case 'stage': {
        const step: StageStep = o.step;
        let advanced = false;
        const done = () => {
          if (advanced || this.interp !== interp) return;
          advanced = true;
          this.pump(ctx);
        };
        bus.emit('stage', { step, done });
        break;
      }
      case 'battle':
        // The script waits; finishBattle() resumes it with resolveBattle().
        if (!this.startBattle(o.step.enemy, { source: 'script', fromInterp: true, handlesLoss: !!o.step.on_lose })) {
          interp.resolveBattle(true);
          this.pump(ctx);
        }
        return;
      case 'done': {
        this.interp = null;
        this.dialogCtx = null;
        store.updateUi({ line: null, choices: null, roll: null, dialogActive: false });
        const cb = this.onDone;
        this.onDone = null;
        // Let the finished script's owner settle the UI first (back to the menu or the
        // world), then flush requests such as start_cutscene so a follow-up scene is not
        // immediately overwritten by that owner.
        cb?.(o.mode);
        this.flush(ctx);
        return;
      }
      default:
        break;
    }
    this.flush(ctx);
  }

  advanceDialog(): void {
    if (!this.interp || !this.dialogCtx) return;
    if (store.ui.choices) return;
    if (store.ui.roll) store.updateUi({ roll: null });
    this.pump(this.dialogCtx);
  }

  chooseOption(index: number): void {
    if (!this.interp || !this.dialogCtx) return;
    const out = this.interp.choose(index);
    if (!out) return;
    store.updateUi({ choices: null });
    this.pump(this.dialogCtx, out);
  }

  private toLine(speaker: string, text: string, mood: string | undefined, loc?: string): DialogLine {
    if (speaker === 'narrate') return { speaker, name: '', text, bust: null, narrate: true, loc };
    if (speaker === 'you') return { speaker, name: store.state?.player.name ?? 'You', text, bust: null, narrate: false, loc };
    const profile = store.content.villagers[speaker]?.profile;
    const set = profile?.portrait_set ?? speaker;
    const busts = store.assets.busts[set]?.moods;
    const bust = busts ? `/${busts[mood ?? 'neutral'] ?? busts.neutral ?? Object.values(busts)[0]}` : null;
    return { speaker, name: profile?.name ?? speaker, text, bust, narrate: false, mood, loc };
  }

  // -- debug -----------------------------------------------------------------

  debug = {
    nextPhase: () => {
      const ctx = this.ctx();
      advancePhases(ctx, 1);
      this.flush(ctx);
    },
    nextDay: () => {
      const ctx = this.ctx();
      sleepUntilMorning(ctx);
      this.flush(ctx);
    },
    setFriendship: (id: string, n: number) => {
      villagerState(store.state!, store.content, id).friendship = n;
      store.commit();
    },
    setRomance: (id: string, n: number) => {
      const v = villagerState(store.state!, store.content, id);
      v.romance = n;
      if (n < 25 && v.romanceState === 'interest') v.romanceState = 'neutral';
      store.commit();
    },
    setResident: (id: string, resident: boolean) => {
      const v = villagerState(store.state!, store.content, id);
      v.resident = resident;
      v.gone = false;
      store.commit();
      bus.emit('npc.refresh');
    },
    addTag: (t: string) => {
      const tags = store.state!.player.tags;
      if (t && !tags.includes(t)) tags.push(t);
      store.commit();
    },
    removeTag: (t: string) => {
      store.state!.player.tags = store.state!.player.tags.filter((x) => x !== t);
      delete store.state!.player.tempTags[t];
      store.commit();
    },
    jump: (map: string, spawn?: string) => {
      const m = store.content.maps[map];
      if (!m) return;
      const s = mapEntities(m, 'spawn').find((e) => e.id === spawn) ?? mapEntities(m, 'spawn')[0];
      if (!s) return;
      store.state!.where = { map, x: s.x, facing: s.facing };
      store.commit();
      bus.emit('world.enter', { map, spawn: s.id });
    },
    grant: (what: 'faith' | 'xp' | 'gold', n: number) => {
      const ctx = this.ctx();
      if (what === 'gold') ctx.state.town.resources.gold += n;
      else applyEffects(what === 'faith' ? { faith: n } : { xp: n }, ctx);
      this.flush(ctx);
    },
    tierLabel: (id: string) => tierForPoints(villagerState(store.state!, store.content, id).friendship),
    startBattle: (enemy: string) => this.startBattle(enemy, { source: 'debug' }),
    setParty: (ids: string[]) => {
      store.state!.party = ids.slice(0, 2);
      store.commit();
    },
    setWeapon: (id: string) => {
      store.state!.player.weaponId = id || null;
      store.commit();
    },
    togglePower: (id: string) => {
      const p = store.state!.player;
      if (p.equippedPowers.includes(id)) {
        p.equippedPowers = p.equippedPowers.filter((x) => x !== id);
      } else {
        if (!p.powers.includes(id)) p.powers.push(id);
        if (p.equippedPowers.length < 4) p.equippedPowers.push(id);
      }
      store.commit();
    },
  };
}

function giftCategory(lists: { loved: string[]; liked: string[]; disliked: string[]; hated: string[] }, item: string): GiftCategory {
  if (lists.loved.includes(item)) return 'loved';
  if (lists.liked.includes(item)) return 'liked';
  if (lists.disliked.includes(item)) return 'disliked';
  if (lists.hated.includes(item)) return 'hated';
  return 'neutral';
}

export const session = new Session();
