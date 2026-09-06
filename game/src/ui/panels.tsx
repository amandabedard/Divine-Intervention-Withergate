import { useMemo, useState } from 'react';
import type { PanelKind, Snapshot } from '../bridge/store';
import { SLOTS } from '../core/save';
import { session } from '../core/session';
import { useMenuNav } from './nav';

export function Panel({ kind, snap }: { kind: PanelKind; snap: Snapshot }) {
  return (
    <div className="screen dim" onClick={() => session.closePanel()}>
      <div className="card panel" onClick={(e) => e.stopPropagation()}>
        {kind === 'bed' ? <BedPanel /> : <FacilityPlaceholder kind={kind} snap={snap} />}
      </div>
    </div>
  );
}

type BedItem =
  | { kind: 'slot'; slot: number; label: string; sub: string }
  | { kind: 'load' | 'save' | 'sleep' | 'cancel'; label: string; disabled?: boolean };

function BedPanel() {
  const [slot, setSlot] = useState<number>(1);
  const slots = session.slots();
  const info = (n: number) => slots.find((s) => s.slot === n);

  const items = useMemo<BedItem[]>(
    () => [
      ...SLOTS.map((n): BedItem => {
        const s = info(n);
        return {
          kind: 'slot',
          slot: n,
          label: `Slot ${n}`,
          sub: s ? `${s.name} · day ${s.day} (${s.phase}) · ${new Date(s.savedAt).toLocaleString()}` : 'empty',
        };
      }),
      { kind: 'load', label: 'Load', disabled: !info(slot) },
      { kind: 'save', label: 'Save' },
      { kind: 'sleep', label: 'Sleep & save' },
      { kind: 'cancel', label: 'Cancel' },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slot, slots.length],
  );

  const run = (it: BedItem) => {
    switch (it.kind) {
      case 'slot':
        setSlot(it.slot);
        break;
      case 'load':
        session.load(slot);
        break;
      case 'save':
        session.save(slot);
        session.closePanel();
        break;
      case 'sleep':
        session.sleepAndSave(slot);
        break;
      default:
        session.closePanel();
    }
  };
  const nav = useMenuNav({
    items,
    isDisabled: (it) => 'disabled' in it && !!it.disabled,
    onSelect: run,
    onCancel: () => session.closePanel(),
  });

  return (
    <>
      <h2>Your bed</h2>
      <p className="muted">Save without losing the day, or sleep until morning and save.</p>
      <div className="slots">
        {items.slice(0, SLOTS.length).map((it, i) => (
          <button key={i} className={`${slot === (it as { slot: number }).slot ? 'on' : ''} ${nav.itemProps(i).className}`} onMouseEnter={nav.itemProps(i).onMouseEnter} onClick={() => run(it)}>
            <b>{it.label}</b>
            <small>{'sub' in it ? it.sub : ''}</small>
          </button>
        ))}
      </div>
      <div className="row end">
        {items.slice(SLOTS.length).map((it, k) => {
          const i = SLOTS.length + k;
          return (
            <button
              key={it.kind}
              className={`${it.kind === 'cancel' ? 'subtle' : ''} ${nav.itemProps(i).className}`}
              disabled={'disabled' in it && !!it.disabled}
              onMouseEnter={nav.itemProps(i).onMouseEnter}
              onClick={() => run(it)}
            >
              {it.label}
            </button>
          );
        })}
      </div>
      <p className="hint small">↑↓ choose a slot or action · Enter confirm · Esc close</p>
    </>
  );
}

function FacilityPlaceholder({ kind, snap }: { kind: PanelKind; snap: Snapshot }) {
  const facility = snap.content.facilities[kind];
  const title = facility?.name ?? kind.replace('_', ' ');
  const phase = kind === 'build' || kind === 'living_quarters' || kind === 'general_store' || kind === 'tavern' ? 'Phase 6' : 'a later phase';
  const items = useMemo(() => [{ label: 'Close', run: () => session.closePanel() }], []);
  const nav = useMenuNav({ items, onSelect: (it) => it.run(), onCancel: () => session.closePanel() });
  return (
    <>
      <h2>{title}</h2>
      <p className="muted">{facility?.description ?? ''}</p>
      <p>This screen arrives in {phase}. For now it is a door that opens onto a plan.</p>
      <div className="row end">
        <button {...nav.itemProps(0)} onClick={() => session.closePanel()}>
          Close
        </button>
      </div>
    </>
  );
}
