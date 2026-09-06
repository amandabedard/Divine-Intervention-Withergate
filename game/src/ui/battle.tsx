import { useMemo } from 'react';
import type { Snapshot } from '../bridge/store';
import { STATUS_LABELS, canSpare, combatPowers, companionSkills, weaponOf } from '../core/combat/battle';
import type { BattleEvent, BattleState } from '../core/combat/battle';
import { session } from '../core/session';
import { maxGrace, maxHp } from '../core/state';
import { useMenuNav } from './nav';

interface Item {
  label: string;
  note?: string;
  disabled?: boolean;
  run: () => void;
}

function Bar({ value, max, kind }: { value: number; max: number; kind: 'hp' | 'grace' | 'enemy' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`bar ${kind}`}>
      <div className="fill" style={{ width: `${pct}%` }} />
      <span>
        {Math.max(0, Math.round(value))} / {Math.round(max)}
      </span>
    </div>
  );
}

export function BattleUi({ snap }: { snap: Snapshot }) {
  const s = snap.state;
  const b = s?.battle ?? null;
  const ui = snap.ui.battle;
  const enemy = b ? snap.content.enemies[b.enemyId] : undefined;

  const items = useMemo<Item[]>(() => {
    if (!s || !b || !ui || b.phase !== 'active') return [];
    const ctx = session.ctx();
    if (ui.view === 'powers') {
      return [
        ...combatPowers(ctx).map((p) => ({
          label: p.name,
          note: `${p.cost} grace`,
          disabled: s.player.grace < p.cost,
          run: () => session.battleAct({ kind: 'power', id: p.id }),
        })),
        { label: 'Back', run: () => session.setBattleView('main') },
      ];
    }
    if (ui.view === 'companions') {
      return [
        ...companionSkills(ctx).map((c) => ({
          label: `${snap.content.villagers[c.villager]?.profile.name ?? c.villager}: ${c.power.name}`,
          run: () => session.battleAct({ kind: 'companion', villager: c.villager, skill: c.power.id }),
        })),
        { label: 'Back', run: () => session.setBattleView('main') },
      ];
    }
    const powers = combatPowers(ctx);
    const skills = companionSkills(ctx);
    const list: Item[] = [
      { label: 'Attack', note: weaponOf(ctx).name, run: () => session.battleAct({ kind: 'attack' }) },
      { label: 'Defend', note: 'halve damage, +2 grace', run: () => session.battleAct({ kind: 'defend' }) },
      { label: 'Powers', note: powers.length ? `${powers.length} ready` : 'none equipped', disabled: !powers.length, run: () => session.setBattleView('powers') },
    ];
    if (skills.length) list.push({ label: 'Companion', note: `${skills.length} skill${skills.length === 1 ? '' : 's'}`, run: () => session.setBattleView('companions') });
    if (canSpare(ctx)) list.push({ label: 'Spare', note: 'it is weak enough to listen', run: () => session.battleAct({ kind: 'spare' }) });
    list.push({ label: 'Flee', run: () => session.battleAct({ kind: 'flee' }) });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.version, ui?.view]);

  const enabled = !!b && !!ui && !ui.busy && b.phase === 'active' && b.awaitingInput;
  const nav = useMenuNav({
    items,
    enabled,
    resetKey: ui?.view,
    isDisabled: (it) => !!it.disabled,
    onSelect: (it) => it.run(),
    onCancel: () => {
      if (ui && ui.view !== 'main') session.setBattleView('main');
    },
  });

  if (!s || !b || !ui || !enemy) return null;
  const nameOf = (id: string) => (id === 'player' ? s.player.name : id === 'enemy' ? enemy.name : snap.content.villagers[id]?.profile.name ?? id);

  return (
    <div className="battle-ui">
      <div className="card enemy-card">
        <div className="card-head">
          <b>{enemy.name}</b>
          <span className="muted">{enemy.tier}</span>
        </div>
        <Bar value={b.enemyHp} max={b.enemyMaxHp} kind="enemy" />
        <Statuses list={b.enemyStatuses} />
      </div>

      <div className="battle-log">
        {ui.log.map((ev, i) => (
          <div key={`${i}-${ev.type}`} className={`log-line ${ev.type}`}>
            {describe(ev, nameOf)}
          </div>
        ))}
      </div>

      <div className="party-cards">
        <div className="card">
          <div className="card-head">
            <b>{s.player.name}</b>
            {b.defending && <span className="chip">bracing</span>}
          </div>
          <Bar value={s.player.hp} max={maxHp(s, snap.content)} kind="hp" />
          <Bar value={s.player.grace} max={maxGrace(s, snap.content)} kind="grace" />
          <Statuses list={b.playerStatuses} />
        </div>
        {b.party.map((id) => (
          <div key={id} className="card companion">
            <b>{snap.content.villagers[id]?.profile.name ?? id}</b>
            <small className="muted">
              {b.passives.interceptor === id && b.interceptsLeft > 0 ? 'ready to intercept' : 'with you'}
            </small>
          </div>
        ))}
      </div>

      <div className="card battle-menu">
        {ui.view !== 'main' && <div className="muted small">{ui.view === 'powers' ? 'Powers' : 'Companion skills'}</div>}
        {b.phase !== 'active' ? (
          <div className="muted">…</div>
        ) : !enabled ? (
          <div className="muted">…</div>
        ) : (
          items.map((it, i) => (
            <button key={`${ui.view}:${i}`} {...nav.itemProps(i)} disabled={it.disabled} onClick={it.run}>
              {it.label}
              {it.note && <small className="muted"> {it.note}</small>}
            </button>
          ))
        )}
        <div className="hint small">↑↓ choose · Enter confirm · Esc back</div>
      </div>
    </div>
  );
}

function Statuses({ list }: { list: BattleState['playerStatuses'] }) {
  if (!list.length) return null;
  return (
    <div className="statuses">
      {list.map((st) => (
        <span key={st.id} className="chip">
          {STATUS_LABELS[st.id]} {st.turns}
        </span>
      ))}
    </div>
  );
}

function describe(ev: BattleEvent, nameOf: (id: string) => string): string {
  switch (ev.type) {
    case 'start':
      return `${nameOf('enemy')} attacks!`;
    case 'round':
      return `Round ${ev.round}`;
    case 'line':
      return `${nameOf(ev.speaker)}: ${ev.text}`;
    case 'enemy_move':
      return `${nameOf('enemy')} uses ${ev.name}.`;
    case 'power':
      return `${nameOf(ev.by)} calls on ${ev.name}.`;
    case 'hit': {
      const eff = ev.mult > 1 ? ' It bites deep.' : ev.mult < 1 ? ' It barely lands.' : '';
      return `${nameOf(ev.actor)} hits ${nameOf(ev.target)} with ${ev.label} for ${ev.damage}${ev.crit ? ', a critical hit' : ''}.${eff}`;
    }
    case 'miss':
      return `${nameOf(ev.target)} dodges ${ev.label}.`;
    case 'heal':
      return `${ev.label} restores ${ev.amount} HP.`;
    case 'status':
      return `${nameOf(ev.target)} is ${STATUS_LABELS[ev.status].toLowerCase()} (${ev.turns}).`;
    case 'status_tick':
      return `${nameOf(ev.target)} takes ${ev.damage} from ${STATUS_LABELS[ev.status].toLowerCase()}.`;
    case 'status_end':
      return `${nameOf(ev.target)} is no longer ${STATUS_LABELS[ev.status].toLowerCase()}.`;
    case 'skip':
      return `${nameOf(ev.target)} is ${STATUS_LABELS[ev.status].toLowerCase()} and cannot act.`;
    case 'defend':
      return 'You brace for the next blow.';
    case 'grace':
      return `+${ev.amount} grace.`;
    case 'intercept':
      return `${nameOf(ev.by)} takes the hit!`;
    case 'flee':
      return ev.success ? (ev.reason === 'explorer' ? 'Your companion knows a way out.' : 'You get away.') : ev.reason === 'rooted' ? 'You are rooted in place.' : 'You cannot get away!';
    case 'spare':
      return ev.success ? `${nameOf('enemy')} backs off.` : 'It does not listen.';
    case 'end': {
      if (ev.result === 'won') {
        const loot = Object.entries(ev.loot).map(([r, n]) => `+${n} ${r}`).join(', ');
        const drops = ev.drops.length ? `, found ${ev.drops.join(', ')}` : '';
        return `Victory. +${ev.xp} XP${loot ? `, ${loot}` : ''}${drops}.`;
      }
      if (ev.result === 'spared') return `You let it go. +${ev.xp} XP.`;
      if (ev.result === 'fled') return 'You escape.';
      return `You fall to ${nameOf('enemy')}.`;
    }
    default:
      return '';
  }
}
