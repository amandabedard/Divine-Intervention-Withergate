import { evaluate } from './conditions';
import type { Ctx } from './ctx';
import { applyEffects } from './effects';

export function startQuest(ctx: Ctx, id: string): void {
  const quest = ctx.content.quests[id];
  if (!quest) return;
  const existing = ctx.state.quests[id];
  if (existing && existing.status !== 'not_started') return;
  const first = quest.stages[0]!;
  ctx.state.quests[id] = { status: 'active', stage: first.id, startedDay: ctx.state.time.day };
  ctx.notify(`Quest started: ${quest.title}`);
  applyEffects(first.on_enter, ctx);
}

export function advanceQuest(ctx: Ctx, id: string, to?: string): void {
  const quest = ctx.content.quests[id];
  const q = ctx.state.quests[id];
  if (!quest || !q || q.status !== 'active') return;
  const idx = quest.stages.findIndex((s) => s.id === q.stage);
  const current = quest.stages[idx];
  if (current) applyEffects(current.on_complete, ctx);
  const nextIdx = to ? quest.stages.findIndex((s) => s.id === to) : idx + 1;
  if (nextIdx < 0 || nextIdx >= quest.stages.length) {
    completeQuest(ctx, id);
    return;
  }
  q.stage = quest.stages[nextIdx]!.id;
  ctx.notify(`${quest.title}: ${quest.stages[nextIdx]!.objective}`);
  applyEffects(quest.stages[nextIdx]!.on_enter, ctx);
}

export function completeQuest(ctx: Ctx, id: string): void {
  const quest = ctx.content.quests[id];
  const q = ctx.state.quests[id];
  if (!quest || !q || q.status === 'done') return;
  q.status = 'done';
  ctx.notify(`Quest complete: ${quest.title}`);
  applyEffects(quest.rewards, ctx);
}

export function failQuest(ctx: Ctx, id: string): void {
  const quest = ctx.content.quests[id];
  const q = ctx.state.quests[id];
  if (!quest || !q || q.status !== 'active') return;
  q.status = 'failed';
  ctx.notify(`Quest failed: ${quest.title}`);
}

/** Advance any active quest whose current stage condition now holds. Loops until stable. */
export function checkQuests(ctx: Ctx): void {
  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false;
    for (const [id, q] of Object.entries(ctx.state.quests)) {
      if (q.status !== 'active') continue;
      const quest = ctx.content.quests[id];
      if (!quest) continue;
      if (quest.fail_when && evaluate(quest.fail_when, ctx)) {
        failQuest(ctx, id);
        changed = true;
        continue;
      }
      const stage = quest.stages.find((s) => s.id === q.stage);
      if (stage && evaluate(stage.complete_when, ctx)) {
        advanceQuest(ctx, id);
        changed = true;
      }
    }
    if (!changed) return;
  }
}
