import { useState } from 'react';
import type { PanelKind, Snapshot } from '../bridge/store';
import { SLOTS } from '../core/save';
import { session } from '../core/session';

export function Panel({ kind, snap }: { kind: PanelKind; snap: Snapshot }) {
  return (
    <div className="screen dim" onClick={() => session.closePanel()}>
      <div className="card panel" onClick={(e) => e.stopPropagation()}>
        {kind === 'bed' ? <BedPanel /> : <FacilityPlaceholder kind={kind} snap={snap} />}
      </div>
    </div>
  );
}

function BedPanel() {
  const [slot, setSlot] = useState<number>(1);
  const slots = session.slots();
  const info = (n: number) => slots.find((s) => s.slot === n);
  return (
    <>
      <h2>Your bed</h2>
      <p className="muted">Save without losing the day, or sleep until morning and save.</p>
      <div className="slots">
        {SLOTS.map((n) => {
          const s = info(n);
          return (
            <button key={n} className={slot === n ? 'on' : ''} onClick={() => setSlot(n)}>
              <b>Slot {n}</b>
              <small>{s ? `${s.name} · day ${s.day} (${s.phase}) · ${new Date(s.savedAt).toLocaleString()}` : 'empty'}</small>
            </button>
          );
        })}
      </div>
      <div className="row end">
        <button className="subtle" onClick={() => session.closePanel()}>
          Cancel
        </button>
        <button disabled={!info(slot)} onClick={() => session.load(slot)}>
          Load
        </button>
        <button onClick={() => { session.save(slot); session.closePanel(); }}>Save</button>
        <button onClick={() => session.sleepAndSave(slot)}>Sleep &amp; save</button>
      </div>
    </>
  );
}

function FacilityPlaceholder({ kind, snap }: { kind: PanelKind; snap: Snapshot }) {
  const facility = snap.content.facilities[kind];
  const title = facility?.name ?? kind.replace('_', ' ');
  const phase = kind === 'build' || kind === 'living_quarters' || kind === 'general_store' || kind === 'tavern' ? 'Phase 6' : 'a later phase';
  return (
    <>
      <h2>{title}</h2>
      <p className="muted">{facility?.description ?? ''}</p>
      <p>This screen arrives in {phase}. For now it is a door that opens onto a plan.</p>
      <div className="row end">
        <button onClick={() => session.closePanel()}>Close</button>
      </div>
    </>
  );
}
