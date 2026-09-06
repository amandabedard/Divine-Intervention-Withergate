// Expeditions: the planner (destination, party, confirm) and the node map you walk.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { NodeType } from '@withergate/shared';
import type { Snapshot } from '../bridge/store';
import { MAX_PARTY, canStart, currentNode, destinations, expeditionSummary, nodeLabel, partyCandidates, reachable, townName } from '../core/expedition';
import type { ExpNode } from '../core/expedition';
import { session } from '../core/session';
import { maxEnergy, maxHp } from '../core/state';
import { PHASE_LABELS } from '../core/time';
import { onNav, useMenuNav } from './nav';

interface Item {
  label: string;
  note?: string;
  disabled?: boolean;
  danger?: boolean;
  run: () => void;
}

const ICONS: Record<NodeType, string> = {
  battle: '⚔',
  elite: '☠',
  event: '✦',
  gather_wood: '🪵',
  gather_ore: '⛏',
  gather_herbs: '🌿',
  gather_food: '🍞',
  rest: '⛺',
  shrine: '✧',
  cache: '▣',
  traveler: '☺',
  settlement: '⌂',
  checkpoint: '⚑',
  boss: '☠',
};

const COL_W = 132;
const ROW_H = 78;
const ROWS = 4;

function List({ title, subtitle, items, onCancel, resetKey }: { title: string; subtitle?: string; items: Item[]; onCancel: () => void; resetKey?: unknown }) {
  const nav = useMenuNav({ items, isDisabled: (it) => !!it.disabled, onSelect: (it) => it.run(), onCancel, resetKey });
  return (
    <>
      <h2>{title}</h2>
      {subtitle && <p className="muted">{subtitle}</p>}
      <div className="panel-list">
        {items.map((it, i) => {
          const p = nav.itemProps(i);
          return (
            <button key={`${i}:${it.label}`} className={`${p.className} ${it.danger ? 'danger' : ''}`} onMouseEnter={p.onMouseEnter} disabled={it.disabled} onClick={it.run}>
              <span>{it.label}</span>
              {it.note && <small className="muted">{it.note}</small>}
            </button>
          );
        })}
      </div>
      <p className="hint small">↑↓ choose · Enter confirm · Esc back</p>
    </>
  );
}

// --- planner ---------------------------------------------------------------------------

export function ExpeditionPlanPanel({ snap }: { snap: Snapshot }) {
  const s = snap.state!;
  const [regionId, setRegionId] = useState<string | null>(null);
  const [party, setParty] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const ctx = session.ctx();
  const dests = useMemo(() => destinations(ctx), [snap.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const candidates = useMemo(() => partyCandidates(ctx), [snap.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const dest = dests.find((d) => d.region.id === regionId);

  const items = useMemo<Item[]>(() => {
    if (!dest) {
      const list: Item[] = dests.map((d) => ({
        label: d.label,
        note: `${d.kind === 'route' ? `${d.days} day${d.days === 1 ? '' : 's'}` : `up to ${d.days} day${d.days === 1 ? '' : 's'}`} · danger ${d.region.danger}`,
        run: () => setRegionId(d.region.id),
      }));
      if (!list.length) list.push({ label: '(no roads lead from here yet)', disabled: true, run: () => undefined });
      list.push({ label: 'Close', run: () => session.closePanel() });
      return list;
    }
    if (!confirm) {
      const list: Item[] = candidates.map((c) => ({
        label: `${party.includes(c.id) ? '☑' : '☐'} ${c.name}`,
        note: c.willing ? `energy ${c.energy}/${c.energyMax}` : c.reason,
        disabled: !c.willing || (!party.includes(c.id) && party.length >= MAX_PARTY),
        run: () => setParty((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id])),
      }));
      if (!candidates.length) list.push({ label: '(no residents to bring)', disabled: true, run: () => undefined });
      list.push({ label: 'Continue', note: party.length ? `with ${party.map((id) => snap.content.villagers[id]?.profile.name ?? id).join(' and ')}` : 'alone', run: () => setConfirm(true) });
      list.push({ label: 'Back', run: () => setRegionId(null) });
      return list;
    }
    const err = canStart(ctx, dest.region.id, party);
    return [
      { label: 'Set out', note: err ?? `${dest.days} day${dest.days === 1 ? '' : 's'} · energy ${s.player.energy}/${maxEnergy(s, snap.content)}`, disabled: !!err, run: () => session.expedition.start(dest.region.id, party) },
      { label: 'Back', run: () => setConfirm(false) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.version, regionId, party, confirm]);

  const title = !dest ? 'Where to?' : !confirm ? `${dest.label}: who comes along?` : dest.label;
  const subtitle = !dest
    ? `From ${townName(snap.content.maps[s.where.map]?.town ?? 'withergate')}. Each node on the road costs a phase; four make a day.`
    : !confirm
      ? `Up to ${MAX_PARTY} companions. They spend energy on the road and turn back when it runs out.`
      : dest.region.description || `${dest.region.biomes.join(', ')}.`;
  return <List title={title} subtitle={subtitle} items={items} resetKey={`${regionId}:${confirm}`} onCancel={() => (confirm ? setConfirm(false) : dest ? setRegionId(null) : session.closePanel())} />;
}

// --- the map ------------------------------------------------------------------------------

function nodeY(rowsInCol: number, row: number): number {
  const top = ((ROWS - rowsInCol) * ROW_H) / 2;
  return top + row * ROW_H + ROW_H / 2;
}

export function ExpeditionUi({ snap, dimmed }: { snap: Snapshot; dimmed: boolean }) {
  const s = snap.state!;
  const exp = s.expedition!;
  const view = snap.ui.expedition;
  const ctx = session.ctx();
  const summary = expeditionSummary(ctx, exp);
  const next = reachable(exp);
  const [pick, setPick] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const active = !dimmed && view?.view === 'map';
  const here = currentNode(exp);

  useEffect(() => {
    setPick(0);
  }, [exp.col]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: Math.max(0, (exp.col + 1) * COL_W - el.clientWidth / 2 + COL_W / 2), behavior: 'smooth' });
  }, [exp.col]);

  useEffect(() => {
    if (!active) return undefined;
    return onNav((a) => {
      if (a === 'up' || a === 'left') setPick((p) => (p - 1 + next.length) % Math.max(1, next.length));
      else if (a === 'down' || a === 'right') setPick((p) => (p + 1) % Math.max(1, next.length));
      else if (a === 'confirm' && next.length) session.expedition.travel(next[pick]!);
      else if (a === 'cancel' || a === 'menu') session.expedition.setView('menu');
    });
  }, [active, next, pick]);

  const menuItems = useMemo<Item[]>(() => {
    if (!view) return [];
    if (view.view === 'result') return [{ label: 'Continue', run: () => session.expedition.next() }];
    if (view.view === 'checkpoint') {
      const hasHaul = summary.haul !== 'nothing';
      const final = !!here?.final;
      return [
        { label: final ? (exp.to ? `Enter ${townName(exp.to)}` : 'Head home') : 'Press on', note: final ? undefined : 'the next stretch of road', run: () => session.expedition.proceed() },
        { label: 'Send the haul home by caravan', note: hasHaul ? `${summary.haul} · risky, but it goes ahead of you` : 'nothing to send', disabled: !hasHaul || final, run: () => session.expedition.sendHaul() },
        { label: 'Head home', note: 'the way back is quicker; what you carry is at risk once', disabled: final, danger: true, run: () => session.expedition.headHome() },
      ];
    }
    if (view.view === 'menu') {
      const canLeave = !!here && (here.type === 'rest' || here.checkpoint);
      return [
        { label: 'Back to the map', run: () => session.expedition.setView('map') },
        { label: 'Head home', note: canLeave ? 'turn back from here' : 'only from a camp or a checkpoint', disabled: !canLeave, danger: true, run: () => session.expedition.headHome() },
      ];
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.version, view?.view]);

  const width = exp.columns.length * COL_W + COL_W;
  const height = ROWS * ROW_H;
  const known = (c: number) => c <= exp.col + exp.preview;
  const cx = (c: number) => c * COL_W + COL_W / 2 + COL_W;

  return (
    <div className={`expedition ${dimmed ? 'dimmed' : ''}`}>
      <div className="exp-head">
        <div>
          <b>{summary.region}</b> · stretch {summary.segment} of {summary.segments} · Day {s.time.day}, {PHASE_LABELS[s.time.phase]}
        </div>
        <div>
          HP {s.player.hp}/{maxHp(s, snap.content)} · Energy {s.player.energy}/{maxEnergy(s, snap.content)}
          {s.party.map((id) => {
            const v = s.villagers[id];
            const p = snap.content.villagers[id]?.profile;
            return v && p ? ` · ${p.name} ${v.energy}/${p.energy ?? 6}` : '';
          })}
        </div>
        <div className="muted">Haul: {summary.haul}</div>
      </div>
      <div className="exp-scroll" ref={scrollRef}>
        <div className="exp-map" style={{ width, height }}>
          <svg className="exp-edges" width={width} height={height}>
            {exp.columns.map((col, c) =>
              col.map((n, r) =>
                n.next.map((j) => {
                  const m = exp.columns[c + 1]!.length;
                  const onPath = n.visited && exp.columns[c + 1]![j]!.visited && c + 1 <= exp.col;
                  const ahead = c === exp.col && next.includes(j);
                  return (
                    <line key={`${c}-${r}-${j}`} x1={cx(c)} y1={nodeY(col.length, r)} x2={cx(c + 1)} y2={nodeY(m, j)} className={onPath ? 'walked' : ahead ? 'ahead' : ''} />
                  );
                }),
              ),
            )}
            {exp.col < 0 && exp.columns[0]!.map((_, j) => <line key={`start-${j}`} x1={COL_W / 2} y1={height / 2} x2={cx(0)} y2={nodeY(exp.columns[0]!.length, j)} className="ahead" />)}
          </svg>
          <div className="exp-node start" style={{ left: COL_W / 2, top: height / 2 }} title={townName(exp.from)}>
            <span className="icon">⌂</span>
            <span className="label">{townName(exp.from)}</span>
          </div>
          {exp.columns.map((col, c) =>
            col.map((n: ExpNode, r) => {
              const isHere = c === exp.col && r === exp.row;
              const isNext = c === exp.col + 1 && next.includes(r);
              const chosen = isNext && next[pick] === r;
              const show = known(c) || n.visited;
              return (
                <button
                  key={`${c}-${r}`}
                  className={`exp-node ${n.checkpoint ? 'checkpoint' : ''} ${n.visited ? 'visited' : ''} ${isHere ? 'here' : ''} ${isNext ? 'next' : ''} ${chosen ? 'chosen' : ''} ${show ? '' : 'unknown'}`}
                  style={{ left: cx(c), top: nodeY(col.length, r) }}
                  disabled={!isNext || !active}
                  onMouseEnter={() => isNext && setPick(next.indexOf(r))}
                  onClick={() => isNext && active && session.expedition.travel(r)}
                  title={show ? `${nodeLabel(n.type)} · ${n.biome}` : 'unknown'}
                >
                  <span className="icon">{show ? ICONS[n.type] : '?'}</span>
                  <span className="label">{show ? (n.final && exp.to ? townName(exp.to) : nodeLabel(n.type)) : '…'}</span>
                </button>
              );
            }),
          )}
        </div>
      </div>
      {view?.view === 'map' && !dimmed && (
        <p className="hint small exp-hint">
          {next.length ? '↑↓ pick the next stop · Enter go' : 'the end of the road'} · Esc menu · nodes beyond {exp.preview} column{exp.preview === 1 ? '' : 's'} ahead are unknown
        </p>
      )}
      {view && view.view !== 'map' && !dimmed && (
        <div className="exp-box">
          {view.view === 'result' && (
            <>
              <h3>{view.title}</h3>
              {view.lines?.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </>
          )}
          {view.view === 'checkpoint' && (
            <>
              <h3>{here?.final && exp.to ? townName(exp.to) : 'Checkpoint'}</h3>
              <p className="muted">{here?.final ? 'The road ends here.' : 'A safe place to take stock before the next stretch.'}</p>
            </>
          )}
          {view.view === 'menu' && <h3>On the road</h3>}
          <ExpMenu items={menuItems} onCancel={() => (view.view === 'menu' ? session.expedition.setView('map') : undefined)} resetKey={view.view} />
        </div>
      )}
    </div>
  );
}

function ExpMenu({ items, onCancel, resetKey }: { items: Item[]; onCancel: () => void; resetKey?: unknown }) {
  const nav = useMenuNav({ items, isDisabled: (it) => !!it.disabled, onSelect: (it) => it.run(), onCancel, resetKey });
  return (
    <div className="panel-list">
      {items.map((it, i) => {
        const p = nav.itemProps(i);
        return (
          <button key={`${i}:${it.label}`} className={`${p.className} ${it.danger ? 'danger' : ''}`} onMouseEnter={p.onMouseEnter} disabled={it.disabled} onClick={it.run}>
            <span>{it.label}</span>
            {it.note && <small className="muted">{it.note}</small>}
          </button>
        );
      })}
    </div>
  );
}
