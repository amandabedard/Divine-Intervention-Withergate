import { useMemo, useState } from 'react';
import { LABELS, STATS } from '@withergate/shared';
import type { Form, Label, Stat } from '@withergate/shared';
import { useStore } from '../bridge/store';
import { session } from '../core/session';

const STAT_HELP: Record<Stat, string> = {
  charisma: 'Talking your way in, out, and around. Faster friendships.',
  intelligence: 'Lore, research, and seeing one column further down the road.',
  luck: 'Rolls, loot, and whether the caravan makes it home.',
  dexterity: 'Fleeing, striking first, and not tripping over roots.',
  perception: 'Noticing the ambush, the lie, the hidden path, the weak point.',
};

export function TitleScreen() {
  const snap = useStore();
  const slots = session.slots();
  const issues = snap.content.issues.filter((i) => i.level === 'error').length;
  return (
    <div className="screen center title">
      <h1>Divine Intervention</h1>
      <h2>Withergate</h2>
      <div className="menu">
        <button onClick={() => session.startCreation()}>New Game</button>
        <button className="subtle" onClick={() => session.quickStart()}>
          Quick Start (dev)
        </button>
        {slots.map((s) => (
          <button key={s.slot} onClick={() => session.load(s.slot)}>
            Continue slot {s.slot}: {s.name}, day {s.day} ({s.phase})
          </button>
        ))}
      </div>
      {issues > 0 && <p className="warn">{issues} content error{issues === 1 ? '' : 's'}. Press ` for details.</p>}
      <p className="hint">Move: ← → or A D · Run: Shift · Interact: E · Debug: `</p>
    </div>
  );
}

export function CreationScreen() {
  const snap = useStore();
  const prog = snap.content.progression.stats;
  const [name, setName] = useState('');
  const [form, setForm] = useState<Form>('fem');
  const [label, setLabel] = useState<Label>('cool');
  const [stats, setStats] = useState<Record<Stat, number>>(
    () => Object.fromEntries(STATS.map((s) => [s, prog.start])) as Record<Stat, number>,
  );
  const spent = useMemo(() => STATS.reduce((sum, s) => sum + (stats[s] - prog.start), 0), [stats, prog.start]);
  const left = prog.points - spent;
  const hasMasc = !!snap.assets.sprites.player_m;

  const bump = (s: Stat, d: number) => {
    const next = stats[s] + d;
    if (next < prog.start || next > prog.max_at_creation) return;
    if (d > 0 && left <= 0) return;
    setStats({ ...stats, [s]: next });
  };

  return (
    <div className="screen center">
      <div className="card creation">
        <h2>Who fell?</h2>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={20} autoFocus />
        </label>
        <div className="row">
          <span>Form</span>
          <button className={form === 'fem' ? 'on' : ''} onClick={() => setForm('fem')}>
            Feminine
          </button>
          <button className={form === 'masc' ? 'on' : ''} onClick={() => setForm('masc')} title={hasMasc ? '' : 'No masculine sprites yet; the feminine set will stand in.'}>
            Masculine{hasMasc ? '' : ' *'}
          </button>
        </div>
        <div className="row">
          <span>Label</span>
          {LABELS.map((l) => (
            <button key={l} className={label === l ? 'on' : ''} onClick={() => setLabel(l)}>
              {l}
            </button>
          ))}
        </div>
        <div className="stats">
          <div className="statshead">
            Stats <span className="points">{left} points left</span>
          </div>
          {STATS.map((s) => (
            <div key={s} className="stat">
              <div>
                <b>{s}</b>
                <small>{STAT_HELP[s]}</small>
              </div>
              <div className="stepper">
                <button onClick={() => bump(s, -1)} disabled={stats[s] <= prog.start}>
                  −
                </button>
                <span>{stats[s]}</span>
                <button onClick={() => bump(s, 1)} disabled={left <= 0 || stats[s] >= prog.max_at_creation}>
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="row end">
          <button className="subtle" onClick={() => session.backToTitle()}>
            Back
          </button>
          <button
            disabled={!name.trim() || left !== 0}
            title={left !== 0 ? 'Spend every point' : ''}
            onClick={() => session.newGame({ name: name.trim(), form, label, stats })}
          >
            Fall
          </button>
        </div>
      </div>
    </div>
  );
}
