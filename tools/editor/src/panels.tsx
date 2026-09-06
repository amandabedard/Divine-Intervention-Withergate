import { useRef, useState } from 'react';
import { ASSET_KINDS, EXIT_DIRECTIONS, IMAGE_ASSET_KINDS, PHASES } from '@withergate/shared';
import type { AssetKind, EntityOf, GameMap, MapEntity, Placement } from '@withergate/shared';
import { api, imageSize, readFileAsDataUrl } from './api';
import { ENTITY_TYPES, LAYERS, editor, spawnsOf, useEditor } from './state';
import type { LayerName, Selection, Tool } from './state';

// --- top bar ---------------------------------------------------------------------

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'place', label: 'Place', key: 'B' },
  { id: 'erase', label: 'Erase', key: 'E' },
  { id: 'collision', label: 'Collision', key: 'C' },
  { id: 'entity', label: 'Entity', key: 'N' },
];

export function TopBar() {
  const st = useEditor();
  const play = () => {
    if (!st.map) return;
    const spawn = st.map.entities.find((e) => e.type === 'spawn')?.id ?? 'default';
    window.open(`http://localhost:5173/?map=${st.map.id}&spawn=${spawn}`, '_blank');
  };
  return (
    <div className="topbar">
      <select value={st.mapId ?? ''} onChange={(e) => editor.openMap(e.target.value)}>
        {!st.mapId && <option value="">(no map)</option>}
        {st.mapFiles.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      <button onClick={() => editor.newMap()}>New map</button>
      <button className={st.dirty ? 'primary' : ''} onClick={() => editor.save()} disabled={!st.map}>
        Save{st.dirty ? ' •' : ''} <kbd>Ctrl+S</kbd>
      </button>
      <button onClick={play} disabled={!st.map} title="Opens the game at this map (needs npm run dev on port 5173)">
        ▶ Play here
      </button>
      <span className="sep" />
      <button onClick={() => editor.undo()} disabled={!st.history.length} title="Ctrl+Z">
        ↶
      </button>
      <button onClick={() => editor.redo()} disabled={!st.future.length} title="Ctrl+Y">
        ↷
      </button>
      <span className="sep" />
      {TOOLS.map((t) => (
        <button key={t.id} className={st.tool === t.id ? 'on' : ''} onClick={() => editor.set({ tool: t.id })} title={t.key}>
          {t.label} <kbd>{t.key}</kbd>
        </button>
      ))}
      {st.tool === 'place' && (
        <select value={st.layer} onChange={(e) => editor.set({ layer: e.target.value as LayerName })} title="Layer to place into">
          {LAYERS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      )}
      {st.tool === 'entity' && (
        <select value={st.entityType} onChange={(e) => editor.set({ entityType: e.target.value as MapEntity['type'] })}>
          {ENTITY_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      )}
      <span className="sep" />
      <label>
        grid{' '}
        <select value={st.grid} onChange={(e) => editor.set({ grid: Number(e.target.value) })}>
          {[8, 16, 32, 64, 128].map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <button className={st.snap ? 'on' : ''} onClick={() => editor.set({ snap: !st.snap })} title="G">
        snap
      </button>
      <span className="status">{st.status}</span>
    </div>
  );
}

// --- assets -----------------------------------------------------------------------

export function AssetPanel() {
  const st = useEditor();
  const [kind, setKind] = useState<AssetKind | 'characters'>('prop');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files?.length || kind === 'characters') return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const dataUrl = await readFileAsDataUrl(f);
        const size = f.type.startsWith('image/') ? await imageSize(dataUrl) : { w: 0, h: 0 };
        await api.uploadAsset({ name: f.name, kind, dataUrl, w: size.w || undefined, h: size.h || undefined });
      }
      await editor.refreshIndex();
      editor.status(`Uploaded ${files.length} file(s) to assets/`);
    } catch (e) {
      editor.status(`Upload failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (id: string) => {
    if (!confirm(`Delete ${id} from assets/? (refused if a map still uses it)`)) return;
    try {
      await api.deleteAsset(id);
      await editor.refreshIndex();
    } catch (e) {
      editor.status((e as Error).message);
    }
  };

  const prune = async () => {
    const unused = st.manifest.assets.filter((a) => !(st.usage[a.id]?.length)).length;
    if (!unused) return editor.status('Nothing unused.');
    if (!confirm(`Move ${unused} unused asset(s) to assets/_unused/?`)) return;
    const r = await api.prune();
    await editor.refreshIndex();
    editor.status(`Moved ${r.moved.length} asset(s) to assets/_unused/`);
  };

  const list = st.manifest.assets.filter((a) => a.kind === kind);
  return (
    <div className="panel assets" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files); }}>
      <div className="tabs">
        {ASSET_KINDS.filter((k) => k !== 'audio').map((k) => (
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
            {k}
          </button>
        ))}
        <button className={kind === 'characters' ? 'on' : ''} onClick={() => setKind('characters')}>
          characters
        </button>
      </div>
      {kind !== 'characters' && (
        <div className="row">
          <button onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Uploading…' : `Upload ${kind}s`}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void upload(e.target.files)} />
          <button className="subtle" onClick={prune} title="Move assets no map references to assets/_unused/">
            prune unused
          </button>
        </div>
      )}
      {kind !== 'characters' && (
        <button className={`asset ${st.assetId === 'placeholder' ? 'on' : ''}`} onClick={() => editor.set({ assetId: 'placeholder', tool: 'place' })}>
          <span className="thumb block">▭</span>
          <span>
            <b>Placeholder block</b>
            <small>labelled colour block; resize and recolour after placing</small>
          </span>
        </button>
      )}
      {kind === 'characters' ? (
        <div className="muted small">
          Character sets come from <code>assets/characters/&lt;set&gt;_sprites</code> and <code>_busts</code>, packed by <code>npm run build:sprites</code>.
          <ul>
            {Object.entries(st.generated.sprites).map(([set, info]) => (
              <li key={set}>
                <b>{set}</b> {Object.keys(info.animations).join(', ')} · {info.frameWidth}×{info.frameHeight}
                {st.generated.busts[set] ? ` · busts: ${Object.keys(st.generated.busts[set]!.moods).join(', ')}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        list.map((a) => {
          const used = st.usage[a.id]?.length ?? 0;
          return (
            <div key={a.id} className={`asset ${st.assetId === a.id ? 'on' : ''}`} onClick={() => editor.set({ assetId: a.id, tool: 'place' })}>
              {IMAGE_ASSET_KINDS.includes(a.kind) ? <img className="thumb" src={`/art/${a.file}`} alt="" /> : <span className="thumb block">♪</span>}
              <span>
                <b>{a.id}</b>
                <small>
                  {a.w && a.h ? `${a.w}×${a.h} · ` : ''}
                  {used ? `used in ${used} map${used === 1 ? '' : 's'}` : 'unused'}
                  {a.placeholder ? ' · placeholder' : ''}
                </small>
              </span>
              <span className="asset-actions">
                <button title="toggle placeholder flag" onClick={(e) => { e.stopPropagation(); void api.patchAsset(a.id, { placeholder: !a.placeholder }).then(() => editor.refreshIndex()); }}>
                  {a.placeholder ? '☑' : '☐'}
                </button>
                <button title="delete" onClick={(e) => { e.stopPropagation(); void remove(a.id); }}>
                  ×
                </button>
              </span>
            </div>
          );
        })
      )}
      {kind !== 'characters' && !list.length && <div className="muted small">No {kind}s yet. Drop image files here or use Upload.</div>}
    </div>
  );
}

// --- properties -----------------------------------------------------------------

function Num({ label, value, onChange, step = 1 }: { label: string; value: number | undefined; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" step={step} value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
function Txt({ label, value, onChange, placeholder }: { label: string; value: string | undefined; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Sel({ label, value, options, onChange }: { label: string; value: string | undefined; options: readonly string[] | { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {(options as any[]).map((o) => {
          const v = typeof o === 'string' ? o : o.value;
          const l = typeof o === 'string' ? o : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </label>
  );
}
function Chk({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <label className="field check">
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
function Color({ label, value, onChange }: { label: string; value: string | undefined; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="row tight">
        <input type="color" value={value ?? '#888888'} onChange={(e) => onChange(e.target.value)} />
        <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  );
}

export function PropertiesPanel() {
  const st = useEditor();
  const map = st.map;
  if (!map) return <div className="panel props muted">Open or create a map.</div>;
  const sel = st.selection;
  return (
    <div className="panel props">
      {sel ? <SelectionEditor map={map} sel={sel} /> : <MapSettings map={map} />}
      <h4>Visibility</h4>
      <div className="row wrap">
        {(Object.keys(st.visible) as (keyof typeof st.visible)[]).map((k) => (
          <Chk key={k} label={k} value={st.visible[k]} onChange={(v) => editor.set({ visible: { ...st.visible, [k]: v } })} />
        ))}
      </div>
      {st.issues.length > 0 && (
        <>
          <h4>Issues</h4>
          {st.issues.map((i, n) => (
            <div key={n} className="issue">
              {i}
            </div>
          ))}
        </>
      )}
      {st.content.issues.length > 0 && (
        <>
          <h4>Content issues ({st.content.issues.length})</h4>
          {st.content.issues.slice(0, 12).map((i, n) => (
            <div key={n} className={`issue ${i.level}`}>
              {i.file}
              {i.line ? `:${i.line}` : ''} — {i.message}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function MapSettings({ map }: { map: GameMap }) {
  const up = (fn: (m: GameMap) => void, key: string) => editor.updateMap(fn, `map:${key}`);
  return (
    <>
      <h4>Map: {map.id}</h4>
      <Txt label="name" value={map.name} onChange={(v) => up((m) => { m.name = v || undefined; }, 'name')} />
      <Txt label="town" value={map.town} onChange={(v) => up((m) => { m.town = v || undefined; }, 'town')} placeholder="withergate, aboridge…" />
      <Chk label="interior" value={map.interior} onChange={(v) => up((m) => { m.interior = v; }, 'interior')} />
      <div className="row">
        <Num label="width" value={map.size.width} onChange={(v) => up((m) => { m.size.width = v; }, 'w')} step={32} />
        <Num label="height" value={map.size.height} onChange={(v) => up((m) => { m.size.height = v; }, 'h')} step={32} />
        <Num label="ground y" value={map.ground_y} onChange={(v) => up((m) => { m.ground_y = v; }, 'gy')} step={8} />
      </div>
      <h4>Ambience</h4>
      <Color label="sky top" value={map.ambience.sky?.top} onChange={(v) => up((m) => { m.ambience.sky = { top: v, bottom: m.ambience.sky?.bottom ?? v }; }, 'skyt')} />
      <Color label="sky bottom" value={map.ambience.sky?.bottom} onChange={(v) => up((m) => { m.ambience.sky = { top: m.ambience.sky?.top ?? v, bottom: v }; }, 'skyb')} />
      <Color label="ground" value={map.ambience.ground_color} onChange={(v) => up((m) => { m.ambience.ground_color = v; }, 'gc')} />
      {PHASES.map((p) => (
        <Color key={p} label={`tint ${p}`} value={map.ambience.tint?.[p]} onChange={(v) => up((m) => { m.ambience.tint = { ...(m.ambience.tint ?? {}), [p]: v }; }, `tint${p}`)} />
      ))}
      <h4>Background layers</h4>
      {map.background.map((b, i) => (
        <div key={i} className="sub">
          <div className="row">
            <Sel label="asset" value={b.asset ?? ''} options={[{ value: '', label: '(silhouette)' }, ...editor.state.manifest.assets.filter((a) => a.kind === 'background').map((a) => ({ value: a.id, label: a.id }))]} onChange={(v) => up((m) => { m.background[i]!.asset = v || undefined; m.background[i]!.silhouette = !v; }, `bg${i}a`)} />
            <button className="subtle" onClick={() => up((m) => { m.background.splice(i, 1); }, `bgdel${i}`)}>
              ×
            </button>
          </div>
          <div className="row">
            <Color label="colour" value={b.color} onChange={(v) => up((m) => { m.background[i]!.color = v; }, `bg${i}c`)} />
            <Num label="parallax" value={b.parallax} step={0.05} onChange={(v) => up((m) => { m.background[i]!.parallax = v; }, `bg${i}p`)} />
            <Num label="y" value={b.y} step={10} onChange={(v) => up((m) => { m.background[i]!.y = v; }, `bg${i}y`)} />
          </div>
        </div>
      ))}
      <button className="subtle" onClick={() => up((m) => { m.background.push({ color: '#6b7a90', parallax: 0.3, repeatX: true, y: 420, silhouette: true }); }, 'bgadd')}>
        + layer
      </button>
    </>
  );
}

function SelectionEditor({ map, sel }: { map: GameMap; sel: NonNullable<Selection> }) {
  const st = useEditor();
  const key = JSON.stringify(sel);
  const up = (fn: (m: GameMap) => void, field: string) => editor.updateMap(fn, `${key}:${field}`);

  if (sel.kind === 'collision') {
    const c = map.collision[sel.index];
    if (!c) return null;
    return (
      <>
        <h4>Collision block</h4>
        <div className="row">
          <Num label="x" value={c.x} onChange={(v) => up((m) => { m.collision[sel.index]!.x = v; }, 'x')} />
          <Num label="y" value={c.y} onChange={(v) => up((m) => { m.collision[sel.index]!.y = v; }, 'y')} />
          <Num label="w" value={c.w} onChange={(v) => up((m) => { m.collision[sel.index]!.w = v; }, 'w')} />
          <Num label="h" value={c.h} onChange={(v) => up((m) => { m.collision[sel.index]!.h = v; }, 'h')} />
        </div>
        <button className="danger" onClick={() => editor.deleteSelection()}>Delete</button>
      </>
    );
  }

  if (sel.kind === 'placement') {
    const p = map.layers[sel.layer][sel.index];
    if (!p) return null;
    const set = (fn: (pl: Placement) => void, field: string) => up((m) => fn(m.layers[sel.layer][sel.index]!), field);
    return (
      <>
        <h4>
          {p.asset === 'placeholder' ? 'Placeholder' : p.asset} <small className="muted">({sel.layer})</small>
        </h4>
        <div className="row">
          <Num label="x" value={p.x} onChange={(v) => set((pl) => { pl.x = v; }, 'x')} />
          <Num label="y" value={p.y} onChange={(v) => set((pl) => { pl.y = v; }, 'y')} />
        </div>
        {p.asset === 'placeholder' ? (
          <>
            <div className="row">
              <Num label="w" value={p.w} onChange={(v) => set((pl) => { pl.w = v; }, 'w')} />
              <Num label="h" value={p.h} onChange={(v) => set((pl) => { pl.h = v; }, 'h')} />
            </div>
            <Txt label="label" value={p.label} onChange={(v) => set((pl) => { pl.label = v; }, 'label')} />
            <Color label="colour" value={p.color} onChange={(v) => set((pl) => { pl.color = v; }, 'color')} />
            <button className="subtle" onClick={() => set((pl) => { pl.y = map.ground_y - (pl.h ?? 120); }, 'sit')}>
              sit on ground
            </button>
          </>
        ) : (
          <>
            <div className="row">
              <Num label="scale" value={p.scale ?? 1} step={0.05} onChange={(v) => set((pl) => { pl.scale = v; }, 'scale')} />
              <Num label="repeat x" value={p.repeatX ?? 1} onChange={(v) => set((pl) => { pl.repeatX = v > 1 ? v : undefined; }, 'rep')} />
            </div>
            <Chk label="flip horizontally" value={p.flipX} onChange={(v) => set((pl) => { pl.flipX = v || undefined; }, 'flip')} />
            <button className="subtle" onClick={() => set((pl) => { const a = st.manifest.assets.find((x) => x.id === pl.asset); pl.y = map.ground_y - (a?.h ?? 0) * (pl.scale ?? 1); }, 'sit')}>
              sit on ground
            </button>
          </>
        )}
        <Sel label="layer" value={sel.layer} options={LAYERS} onChange={(v) => {
          const target = v as LayerName;
          editor.updateMap((m) => {
            const [moved] = m.layers[sel.layer].splice(sel.index, 1);
            if (moved) m.layers[target].push(moved);
          });
          editor.select({ kind: 'placement', layer: target, index: editor.state.map!.layers[target].length - 1 });
        }} />
        <div className="row">
          <button className="subtle" onClick={() => editor.updateMap((m) => { const l = m.layers[sel.layer]; if (sel.index > 0) { [l[sel.index - 1], l[sel.index]] = [l[sel.index]!, l[sel.index - 1]!]; editor.select({ ...sel, index: sel.index - 1 }); } })}>
            send back
          </button>
          <button className="subtle" onClick={() => editor.updateMap((m) => { const l = m.layers[sel.layer]; if (sel.index < l.length - 1) { [l[sel.index + 1], l[sel.index]] = [l[sel.index]!, l[sel.index + 1]!]; editor.select({ ...sel, index: sel.index + 1 }); } })}>
            bring forward
          </button>
          <button className="danger" onClick={() => editor.deleteSelection()}>Delete</button>
        </div>
      </>
    );
  }

  const e = map.entities[sel.index];
  if (!e) return null;
  const setE = <T extends MapEntity>(fn: (ent: T) => void, field: string) => up((m) => fn(m.entities[sel.index] as T), field);
  const idField = (
    <Txt label="id" value={e.id} onChange={(v) => setE<MapEntity>((ent) => { ent.id = v; }, 'id')} />
  );
  const pos = (
    <div className="row">
      <Num label="x" value={e.x} onChange={(v) => setE<MapEntity>((ent) => { ent.x = v; }, 'x')} />
      <Num label="y" value={e.y} onChange={(v) => setE<MapEntity>((ent) => { ent.y = v; }, 'y')} />
      {'w' in e && <Num label="w" value={e.w} onChange={(v) => setE<Extract<MapEntity, { w: number }>>((ent) => { ent.w = v; }, 'w')} />}
      {'h' in e && <Num label="h" value={e.h} onChange={(v) => setE<Extract<MapEntity, { h: number }>>((ent) => { ent.h = v; }, 'h')} />}
    </div>
  );
  const del = <button className="danger" onClick={() => editor.deleteSelection()}>Delete</button>;

  switch (e.type) {
    case 'spawn':
    case 'npc_spot':
      return (
        <>
          <h4>{e.type === 'spawn' ? 'Spawn point' : 'NPC spot'}</h4>
          {idField}
          {pos}
          <Sel label="facing" value={e.facing} options={['left', 'right']} onChange={(v) => setE<EntityOf<'spawn'>>((ent) => { ent.facing = v as 'left' | 'right'; }, 'facing')} />
          {e.type === 'npc_spot' && <div className="muted small">Referenced from character schedules as <code>{`{ map: ${map.id}, spot: ${e.id} }`}</code>.</div>}
          {del}
        </>
      );
    case 'exit': {
      const ex = e;
      const spawns = spawnsOf(st.maps, ex.to.map);
      return (
        <>
          <h4>Exit</h4>
          {idField}
          {pos}
          <Txt label="label" value={ex.label} onChange={(v) => setE<EntityOf<'exit'>>((ent) => { ent.label = v || undefined; }, 'label')} />
          <Sel label="direction" value={ex.direction} options={EXIT_DIRECTIONS} onChange={(v) => setE<EntityOf<'exit'>>((ent) => { ent.direction = v as EntityOf<'exit'>['direction']; }, 'dir')} />
          <Chk label="auto (walk in to use; default for left/right)" value={ex.auto ?? (ex.direction === 'left' || ex.direction === 'right')} onChange={(v) => setE<EntityOf<'exit'>>((ent) => { ent.auto = v; }, 'auto')} />
          <Sel label="to map" value={ex.to.map} options={st.maps.map((m) => m.id)} onChange={(v) => setE<EntityOf<'exit'>>((ent) => { ent.to.map = v; ent.to.spawn = spawnsOf(st.maps, v)[0] ?? 'default'; }, 'tomap')} />
          <Sel label="to spawn" value={ex.to.spawn} options={spawns.length ? spawns : [ex.to.spawn]} onChange={(v) => setE<EntityOf<'exit'>>((ent) => { ent.to.spawn = v; }, 'tospawn')} />
          {del}
        </>
      );
    }
    case 'interactable': {
      const it = e;
      const a = it.action;
      return (
        <>
          <h4>Interactable</h4>
          {idField}
          {pos}
          <Txt label="label" value={it.label} onChange={(v) => setE<EntityOf<'interactable'>>((ent) => { ent.label = v || undefined; }, 'label')} />
          <Sel
            label="action"
            value={a.kind}
            options={['sign', 'open_ui', 'run_script', 'forage', 'facility']}
            onChange={(v) =>
              setE<EntityOf<'interactable'>>((ent) => {
                switch (v) {
                  case 'open_ui': ent.action = { kind: 'open_ui', ui: 'bed' }; break;
                  case 'run_script': ent.action = { kind: 'run_script', script: st.content.shared[0] ?? 'shared/notice_board' }; break;
                  case 'forage': ent.action = { kind: 'forage', resource: 'herbs', amount: [1, 3], once_per_day: true }; break;
                  case 'facility': ent.action = { kind: 'facility', facility: st.content.facilities[0]?.id ?? 'barracks' }; break;
                  default: ent.action = { kind: 'sign', text: '[PLACEHOLDER: sign text]' };
                }
              }, 'kind')
            }
          />
          {a.kind === 'sign' && <Txt label="text" value={a.text} onChange={(v) => setE<EntityOf<'interactable'>>((ent) => { (ent.action as any).text = v; }, 'text')} />}
          {a.kind === 'open_ui' && <Sel label="ui" value={a.ui} options={['bed', 'living_quarters', 'general_store', 'tavern', 'build', 'notice_board']} onChange={(v) => setE<EntityOf<'interactable'>>((ent) => { (ent.action as any).ui = v; }, 'ui')} />}
          {a.kind === 'run_script' && <Sel label="script" value={a.script} options={st.content.shared.length ? st.content.shared : [a.script]} onChange={(v) => setE<EntityOf<'interactable'>>((ent) => { (ent.action as any).script = v; }, 'script')} />}
          {a.kind === 'facility' && <Sel label="facility" value={a.facility} options={st.content.facilities.map((f) => f.id)} onChange={(v) => setE<EntityOf<'interactable'>>((ent) => { (ent.action as any).facility = v; }, 'facility')} />}
          {a.kind === 'forage' && (
            <>
              <Sel label="resource" value={a.resource} options={['wood', 'stone', 'ore', 'food', 'herbs', 'cloth']} onChange={(v) => setE<EntityOf<'interactable'>>((ent) => { (ent.action as any).resource = v; }, 'res')} />
              <div className="row">
                <Num label="min" value={a.amount[0]} onChange={(v) => setE<EntityOf<'interactable'>>((ent) => { (ent.action as any).amount[0] = v; }, 'min')} />
                <Num label="max" value={a.amount[1]} onChange={(v) => setE<EntityOf<'interactable'>>((ent) => { (ent.action as any).amount[1] = v; }, 'max')} />
              </div>
              <Chk label="once per day" value={a.once_per_day} onChange={(v) => setE<EntityOf<'interactable'>>((ent) => { (ent.action as any).once_per_day = v; }, 'once')} />
            </>
          )}
          {del}
        </>
      );
    }
    case 'trigger': {
      const t = e;
      return (
        <>
          <h4>Trigger zone</h4>
          {idField}
          {pos}
          <Chk label="once" value={t.once} onChange={(v) => setE<EntityOf<'trigger'>>((ent) => { ent.once = v; }, 'once')} />
          <Sel label="action" value={t.action.kind} options={['run_script', 'start_event', 'start_cutscene']} onChange={(v) => setE<EntityOf<'trigger'>>((ent) => {
            if (v === 'start_event') ent.action = { kind: 'start_event', event: st.content.events[0] ?? '' };
            else if (v === 'start_cutscene') ent.action = { kind: 'start_cutscene', cutscene: st.content.cutscenes[0] ?? '' };
            else ent.action = { kind: 'run_script', script: st.content.shared[0] ?? '' };
          }, 'kind')} />
          {t.action.kind === 'run_script' && <Sel label="script" value={t.action.script} options={st.content.shared} onChange={(v) => setE<EntityOf<'trigger'>>((ent) => { (ent.action as any).script = v; }, 'script')} />}
          {t.action.kind === 'start_event' && <Sel label="event" value={t.action.event} options={st.content.events} onChange={(v) => setE<EntityOf<'trigger'>>((ent) => { (ent.action as any).event = v; }, 'event')} />}
          {t.action.kind === 'start_cutscene' && <Sel label="cutscene" value={t.action.cutscene} options={st.content.cutscenes} onChange={(v) => setE<EntityOf<'trigger'>>((ent) => { (ent.action as any).cutscene = v; }, 'cutscene')} />}
          {del}
        </>
      );
    }
    case 'facility_slot':
      return (
        <>
          <h4>Facility slot</h4>
          {idField}
          {pos}
          <Sel label="size" value={e.size} options={['small', 'large']} onChange={(v) => setE<EntityOf<'facility_slot'>>((ent) => { ent.size = v as 'small' | 'large'; }, 'size')} />
          {del}
        </>
      );
    case 'camera_bounds':
    default:
      return (
        <>
          <h4>Camera bounds</h4>
          {idField}
          {pos}
          {del}
        </>
      );
  }
}
