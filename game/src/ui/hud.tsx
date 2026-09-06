import type { Snapshot, Toast } from '../bridge/store';
import { faithLevel, maxEnergy, maxHp } from '../core/state';
import { PHASE_LABELS } from '../core/time';

export function Hud({ snap }: { snap: Snapshot }) {
  const s = snap.state!;
  const map = snap.content.maps[s.where.map];
  return (
    <div className="hud">
      <div className="pill">
        Day {s.time.day} · {PHASE_LABELS[s.time.phase]} · {map?.name ?? s.where.map}
      </div>
      <div className="pill right">
        HP {s.player.hp}/{maxHp(s, snap.content)} · Energy {s.player.energy}/{maxEnergy(s, snap.content)} · Faith {s.player.faith} (lv {faithLevel(s, snap.content)})
      </div>
      {snap.ui.mode === 'world' && <div className="hint bottom">← → move · Shift run · E interact · ` debug</div>}
    </div>
  );
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}
