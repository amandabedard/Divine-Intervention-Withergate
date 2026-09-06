import { DOMAIN_LABELS, resolveCheck, substituteText } from '@withergate/shared';
import type {
  BattleStep,
  CheckResult,
  ChoiceOption,
  ChoiceStep,
  Effects,
  LineStep,
  Script,
  StageStep,
  Stat,
  Step,
} from '@withergate/shared';
import { evaluate } from '../conditions';
import type { Ctx } from '../ctx';
import { applyEffects } from '../effects';
import { domainLean } from '../state';

export type InterpreterOutput =
  | { type: 'line'; step: LineStep; text: string }
  | { type: 'choice'; step: ChoiceStep; options: { index: number; option: ChoiceOption; locked: boolean }[] }
  | { type: 'roll'; stat: Stat; result: CheckResult }
  | { type: 'stage'; step: StageStep }
  | { type: 'battle'; step: BattleStep }
  | { type: 'done'; mode: 'menu' | 'close' | 'scene' | 'natural' };

interface Frame {
  steps: Step[];
  index: number;
  nodes: Record<string, Step[]>;
  scriptId: string;
}

/**
 * Runs a normalised script step by step. Call next() to get the next thing the
 * UI must show; call choose(i) to answer a choice; call resolveBattle() after a fight.
 */
export class Interpreter {
  private frames: Frame[] = [];
  private pendingChoice: { step: ChoiceStep; options: { index: number; option: ChoiceOption; locked: boolean }[] } | null = null;
  private pendingBattle: BattleStep | null = null;

  constructor(
    private readonly ctx: Ctx,
    script: Script,
    private readonly scriptId: string,
  ) {
    this.frames.push({ steps: script.nodes.start ?? [], index: 0, nodes: script.nodes, scriptId });
  }

  get done(): boolean {
    return this.frames.length === 0 && !this.pendingChoice && !this.pendingBattle;
  }

  next(): InterpreterOutput {
    if (this.pendingChoice) return { type: 'choice', ...this.pendingChoice };
    if (this.pendingBattle) return { type: 'battle', step: this.pendingBattle };
    while (this.frames.length) {
      const frame = this.frames[this.frames.length - 1]!;
      if (frame.index >= frame.steps.length) {
        this.frames.pop();
        continue;
      }
      const step = frame.steps[frame.index]!;
      frame.index += 1;
      const out = this.run(step, frame);
      if (out) return out;
    }
    return { type: 'done', mode: 'natural' };
  }

  choose(index: number): InterpreterOutput | null {
    if (!this.pendingChoice) return null;
    const entry = this.pendingChoice.options.find((o) => o.index === index);
    if (!entry || entry.locked) return null;
    const option = entry.option;
    this.pendingChoice = null;
    if (option.once && !this.ctx.state.choicesMade.includes(option.id)) this.ctx.state.choicesMade.push(option.id);
    this.applyEffects(option.effects);
    if (option.check) {
      const roll = this.roll(option.check.stat, option.check.dc);
      this.pushBranch(this.branchFor(roll, option), option);
      return { type: 'roll', stat: option.check.stat, result: roll };
    }
    if (option.then) this.push(option.then);
    return this.next();
  }

  resolveBattle(won: boolean): void {
    const b = this.pendingBattle;
    if (!b) return;
    this.pendingBattle = null;
    const branch = won ? b.on_win : b.on_lose;
    if (branch) this.push(branch);
  }

  // -- internals -----------------------------------------------------------

  private top(): Frame {
    return this.frames[this.frames.length - 1]!;
  }

  private push(steps: Step[]): void {
    const parent = this.top();
    this.frames.push({ steps, index: 0, nodes: parent.nodes, scriptId: parent.scriptId });
  }

  private pushBranch(steps: Step[] | undefined, _owner: unknown): void {
    if (steps) this.push(steps);
  }

  private applyEffects(effects: Effects | undefined): void {
    if (!effects) return;
    const before = this.ctx.requests.length;
    applyEffects(effects, this.ctx);
    const added = this.ctx.requests.splice(before);
    for (const req of added) {
      if (req.kind === 'battle') {
        this.pendingBattle = { kind: 'battle', enemy: req.enemy, on_win: req.on_win, on_lose: req.on_lose };
      } else {
        this.ctx.requests.push(req);
      }
    }
  }

  private roll(stat: Stat, dc: number): CheckResult {
    const bonus = Number(this.ctx.state.flags[`bonus:${stat}`] ?? 0);
    return resolveCheck(this.ctx.rng.d20(), this.ctx.state.player.stats[stat], this.ctx.state.player.stats.luck, dc, bonus);
  }

  private branchFor(
    roll: CheckResult,
    branches: { success?: Step[]; fail?: Step[]; crit_success?: Step[]; crit_fail?: Step[] },
  ): Step[] | undefined {
    switch (roll.outcome) {
      case 'crit_success':
        return branches.crit_success ?? branches.success;
      case 'crit_fail':
        return branches.crit_fail ?? branches.fail;
      case 'success':
        return branches.success;
      default:
        return branches.fail;
    }
  }

  private substitute(text: string): string {
    const lean = domainLean(this.ctx.state);
    return substituteText(text, {
      name: this.ctx.state.player.name,
      town: 'Withergate',
      domain: lean === 'none' ? 'nothing in particular' : DOMAIN_LABELS[lean],
    });
  }

  private run(step: Step, frame: Frame): InterpreterOutput | null {
    switch (step.kind) {
      case 'line':
        return { type: 'line', step, text: this.substitute(step.text) };
      case 'effects':
        this.applyEffects(step.effects);
        if (this.pendingBattle) return { type: 'battle', step: this.pendingBattle };
        return null;
      case 'if':
        this.push(evaluate(step.cond, this.ctx) ? step.then : step.else ?? []);
        return null;
      case 'select': {
        const branch = step.branches.find((b) => !b.when || evaluate(b.when, this.ctx));
        if (branch) this.push(branch.then);
        return null;
      }
      case 'check': {
        const roll = this.roll(step.stat, step.dc);
        this.pushBranch(this.branchFor(roll, step), step);
        return { type: 'roll', stat: step.stat, result: roll };
      }
      case 'random': {
        const picked = this.ctx.rng.weighted(step.options, (o) => o.weight);
        this.push(picked.then);
        return null;
      }
      case 'goto': {
        let i = this.frames.length - 1;
        while (i > 0 && this.frames[i]!.scriptId !== frame.scriptId) i -= 1;
        this.frames.length = i + 1;
        const target = frame.nodes[step.node];
        if (!target) {
          this.frames.length = 0;
          return { type: 'done', mode: 'natural' };
        }
        this.frames[i] = { steps: target, index: 0, nodes: frame.nodes, scriptId: frame.scriptId };
        return null;
      }
      case 'run': {
        const shared = this.ctx.content.shared[step.script];
        if (shared) this.frames.push({ steps: shared.nodes.start ?? [], index: 0, nodes: shared.nodes, scriptId: step.script });
        return null;
      }
      case 'end':
        this.frames.length = 0;
        return { type: 'done', mode: step.mode };
      case 'battle':
        this.pendingBattle = step;
        return { type: 'battle', step };
      case 'stage':
        return { type: 'stage', step };
      case 'choice': {
        const options = step.options
          .map((option, index) => {
            const used = option.once && this.ctx.state.choicesMade.includes(option.id);
            const ok = !used && evaluate(option.requires, this.ctx);
            if (ok) return { index, option, locked: false };
            if (option.show_locked && !used) return { index, option, locked: true };
            return null;
          })
          .filter((o): o is { index: number; option: ChoiceOption; locked: boolean } => o !== null);
        if (!options.length) return null;
        this.pendingChoice = { step, options };
        return { type: 'choice', step, options };
      }
      default:
        return null;
    }
  }

  get id(): string {
    return this.scriptId;
  }
}
