import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadContent } from '@withergate/shared/node';
import type { ContentBundle } from '@withergate/shared';
import { evaluate } from './conditions';
import type { Ctx } from './ctx';
import { applyEffects } from './effects';
import { checkQuests } from './quests';
import { Rng } from './rng';
import { whereIs } from './schedule';
import { newGame, villagerState } from './state';
import type { GameState } from './state';

const here = path.dirname(fileURLToPath(import.meta.url));
let content: ContentBundle;

function mk(state: GameState): Ctx {
  return { state, content, rng: new Rng(2), notify: () => undefined, requests: [] };
}
function start(): GameState {
  const state = newGame(content, {
    name: 'Test',
    form: 'fem',
    label: 'cool',
    stats: { charisma: 5, intelligence: 5, luck: 5, dexterity: 5, perception: 5 },
    seed: 9,
  });
  state.time.phase = 'morning';
  return state;
}

beforeAll(async () => {
  const result = await loadContent({ root: path.resolve(here, '../../../content') });
  content = result.bundle;
  expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
});

describe('Aboridge: the audience and the first recruit (L2)', () => {
  it('the king waits with the candidates; the audience sends Aldric home and opens recruitment', () => {
    const state = start();
    const ctx = mk(state);
    applyEffects({ guest: 'aldric' }, ctx);
    state.where = { map: 'aboridge_castle', x: 160, facing: 'right' };

    const ev = content.villagers.king!.events.find((e) => e.id === 'king_audience')!;
    expect(ev.trigger).toMatchObject({ on: 'enter_map', once: true });
    expect(ev.stage).toMatchObject({ map: 'aboridge_castle' });
    expect(evaluate(ev.trigger.requires, { ...ctx, speaker: 'king' })).toBe(true);
    expect(whereIs(ctx, 'king')).toMatchObject({ map: 'aboridge_castle', spot: 'throne' });
    expect(whereIs(ctx, 'jasper')).toMatchObject({ map: 'aboridge_castle', spot: 'candidate_left' });
    expect(whereIs(ctx, 'gemma')).toMatchObject({ map: 'aboridge_castle', spot: 'candidate_right' });
    // nobody can be recruited before the king has spoken
    expect(evaluate({ recruit_conditions_met: 'jasper' }, ctx)).toBe(false);
    expect(evaluate({ recruit_conditions_met: 'gemma' }, ctx)).toBe(false);

    // the audience: Aldric is sent back to the barracks, the candidates are introduced
    applyEffects({ unguest: 'aldric' }, ctx);
    applyEffects({ flags: { king_audience: true }, introduce: ['king', 'jasper', 'gemma'] }, ctx);
    expect(state.party).toEqual([]);
    expect(state.guests).toEqual([]);
    expect(whereIs(ctx, 'aldric')).toMatchObject({ map: 'aboridge_upper', spot: 'barracks_door' });
    expect(evaluate(ev.trigger.requires, { ...ctx, speaker: 'king' })).toBe(false);
    expect(evaluate({ recruit_conditions_met: 'jasper' }, ctx)).toBe(true);
    expect(evaluate({ recruit_conditions_met: 'gemma' }, ctx)).toBe(true);
  });

  it("recruiting a candidate finishes act 0 through the king's thanks; the other one stays behind", () => {
    const state = start();
    const ctx = mk(state);
    state.quests.main_act0 = { status: 'active', stage: 'aboridge', startedDay: 1 };
    state.where = { map: 'aboridge', x: 200, facing: 'right' };
    checkQuests(ctx);
    expect(state.quests.main_act0!.stage).toBe('castle');
    applyEffects({ flags: { king_audience: true } }, ctx);
    checkQuests(ctx);
    expect(state.quests.main_act0!.stage).toBe('choose');

    applyEffects({ recruit: 'gemma' }, ctx);
    checkQuests(ctx);
    expect(state.quests.main_act0!.stage).toBe('thanks');
    expect(ctx.requests).toContainEqual({ kind: 'cutscene', id: 'the_kings_thanks' });
    expect(villagerState(state, content, 'gemma').resident).toBe(true);
    // still in the throne room for the king's word, then she lives in Withergate
    expect(whereIs(ctx, 'gemma')?.map).toBe('aboridge_castle');
    applyEffects({ flags: { king_thanks: true } }, ctx);
    checkQuests(ctx);
    expect(state.quests.main_act0!.status).toBe('done');
    expect(state.quests.main_act1).toMatchObject({ status: 'active', stage: 'home' });
    expect(whereIs(ctx, 'gemma')?.map).toBe('withergate');

    // Jasper stays in Aboridge and needs the usual friendship from now on (M3)
    expect(whereIs(ctx, 'jasper')).toMatchObject({ map: 'aboridge', spot: 'mine_gate' });
    expect(evaluate({ recruit_conditions_met: 'jasper' }, ctx)).toBe(false);
    applyEffects({ set_tier: { jasper: 'acquaintance' } }, ctx);
    expect(evaluate({ recruit_conditions_met: 'jasper' }, ctx)).toBe(true);
  });
});
