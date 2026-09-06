import { useState } from 'react';
import { DOMAINS, mapEntities, tierForPoints } from '@withergate/shared';
import type { Snapshot } from '../bridge/store';
import { TIER_LABELS } from '../core/relationships';
import { session } from '../core/session';
import { activeTags, domainLean, faithLevel, villagerState } from '../core/state';

export function DebugPanel({ snap }: { snap: Snapshot }) {
  const s = snap.state;
  const [tag, setTag] = useState('');
  const [map, setMap] = useState(s?.where.map ?? Object.keys(snap.content.maps)[0] ?? '');
  const [spawn, setSpawn] = useState('');
  const [enemy, setEnemy] = useState(Object.keys(snap.content.enemies)[0] ?? '');
  const [region, setRegion] = useState(Object.keys(snap.content.regions)[0] ?? '');
  const issues = snap.content.issues;
  const spawns = snap.content.maps[map] ? mapEntities(snap.content.maps[map]!, 'spawn') : [];

  return (
    <div className="debug" onKeyDown={(e) => e.stopPropagation()}>
      <div className="debug-head">
        <b>Debug</b> <span className="muted">` to close</span>
      </div>

      <section>
        <h4>Content</h4>
        <div className="muted">
          {snap.content.stats.files} files · {snap.content.stats.villagers} characters · {snap.content.stats.maps} maps · {snap.content.stats.lines} lines ·{' '}
          {snap.content.stats.placeholders} placeholders
        </div>
        {issues.length === 0 && <div className="ok">No content issues.</div>}
        {issues.map((i, n) => (
          <div key={n} className={`issue ${i.level}`}>
            {i.file}
            {i.line ? `:${i.line}` : ''} — {i.message}
          </div>
        ))}
      </section>

      {s && (
        <>
          <section>
            <h4>Time</h4>
            <div className="row">
              <span>
                Day {s.time.day}, {s.time.phase}
              </span>
              <button onClick={() => session.debug.nextPhase()}>+ phase</button>
              <button onClick={() => session.debug.nextDay()}>next morning</button>
            </div>
          </section>

          <section>
            <h4>Expedition</h4>
            <div className="row">
              <select value={region} onChange={(e) => setRegion(e.target.value)}>
                {Object.values(snap.content.regions).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.kind}, from {r.from})
                  </option>
                ))}
              </select>
              <button onClick={() => session.debug.startExpedition(region, s.party)} disabled={!!s.expedition}>
                set out
              </button>
            </div>
            <div className="muted">
              {s.expedition ? `on ${s.expedition.region}, column ${s.expedition.col + 1}/${s.expedition.columns.length}` : 'at home'} · party: {s.party.join(', ') || 'none'} · caravans in transit:{' '}
              {s.caravans.length}
            </div>
          </section>

          <section>
            <h4>Battle</h4>
            <div className="row">
              <select value={enemy} onChange={(e) => setEnemy(e.target.value)}>
                {Object.values(snap.content.enemies).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.tier})
                  </option>
                ))}
              </select>
              <button disabled={!!s.battle || !enemy} onClick={() => session.debug.startBattle(enemy)}>
                Start battle
              </button>
            </div>
            <div className="row wrap">
              <span>Party:</span>
              {Object.values(snap.content.villagers)
                .filter((v) => v.profile.recruit)
                .map((v) => (
                  <label key={v.profile.id}>
                    <input
                      type="checkbox"
                      checked={s.party.includes(v.profile.id)}
                      disabled={!!s.battle}
                      onChange={(e) =>
                        session.debug.setParty(e.target.checked ? [...s.party, v.profile.id] : s.party.filter((id) => id !== v.profile.id))
                      }
                    />{' '}
                    {v.profile.name}
                  </label>
                ))}
            </div>
            <div className="row">
              <span>Weapon:</span>
              <select value={s.player.weaponId ?? ''} onChange={(e) => session.debug.setWeapon(e.target.value)}>
                <option value="">(bare hands)</option>
                {Object.values(snap.content.weapons).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · {w.damage_type} ×{w.power}
                  </option>
                ))}
              </select>
            </div>
            <div className="row wrap">
              <span>Powers:</span>
              {Object.values(snap.content.powers)
                .filter((p) => p.kind === 'combat')
                .map((p) => (
                  <label key={p.id}>
                    <input type="checkbox" checked={s.player.equippedPowers.includes(p.id)} onChange={() => session.debug.togglePower(p.id)} /> {p.name} ({p.cost})
                  </label>
                ))}
            </div>
          </section>

          <section>
            <h4>Player</h4>
            <div className="muted">
              {s.player.name} · lv {s.player.level} ({s.player.xp} xp) · hp {s.player.hp} · grace {s.player.grace} · energy {s.player.energy} · faith {s.player.faith} (lv{' '}
              {faithLevel(s, snap.content)}) · skill pts {s.player.skillPoints} · lean {domainLean(s)} (secret)
            </div>
            <div className="muted">{DOMAINS.map((d) => `${d} ${s.player.domainPoints[d]}`).join(' · ')}</div>
            <div className="row">
              <button onClick={() => session.debug.grant('faith', 10)}>+10 faith</button>
              <button onClick={() => session.debug.grant('skill', 1)}>+1 skill pt</button>
              <button onClick={() => session.debug.grant('xp', 50)}>+50 xp</button>
              <button onClick={() => session.debug.grant('gold', 100)}>+100 gold</button>
              <button onClick={() => session.debug.grant('materials', 50)}>+50 materials</button>
            </div>
            <div className="row wrap">
              <span>Tags:</span>
              {activeTags(s).map((t) => (
                <span key={t} className="chip">
                  {t} <button onClick={() => session.debug.removeTag(t)}>×</button>
                </span>
              ))}
              <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="add tag" size={10} />
              <button
                onClick={() => {
                  session.debug.addTag(tag.trim());
                  setTag('');
                }}
              >
                add
              </button>
            </div>
          </section>

          <section>
            <h4>Characters</h4>
            {Object.values(snap.content.villagers).map((v) => {
              const rel = villagerState(s, snap.content, v.profile.id);
              return (
                <div key={v.profile.id} className="villager">
                  <b>{v.profile.name}</b> <span className="muted">{TIER_LABELS[tierForPoints(rel.friendship)]}{rel.romanceState !== 'neutral' ? ` · ${rel.romanceState}` : ''}{rel.met ? '' : ' · not met'}</span>
                  <div className="row">
                    <label>
                      friendship{' '}
                      <input type="number" value={rel.friendship} onChange={(e) => session.debug.setFriendship(v.profile.id, Number(e.target.value))} />
                    </label>
                    <label>
                      romance <input type="number" value={rel.romance} onChange={(e) => session.debug.setRomance(v.profile.id, Number(e.target.value))} />
                    </label>
                    <label>
                      <input type="checkbox" checked={rel.resident} onChange={(e) => session.debug.setResident(v.profile.id, e.target.checked)} /> resident
                    </label>
                  </div>
                </div>
              );
            })}
          </section>

          <section>
            <h4>Jump</h4>
            <div className="row">
              <select value={map} onChange={(e) => { setMap(e.target.value); setSpawn(''); }}>
                {Object.keys(snap.content.maps).map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <select value={spawn} onChange={(e) => setSpawn(e.target.value)}>
                <option value="">(first spawn)</option>
                {spawns.map((sp) => (
                  <option key={sp.id}>{sp.id}</option>
                ))}
              </select>
              <button onClick={() => session.debug.jump(map, spawn || undefined)}>Go</button>
            </div>
          </section>

          <section>
            <h4>Flags &amp; quests</h4>
            <div className="muted small">
              {Object.entries(s.flags).map(([k, v]) => `${k}=${String(v)}`).join(' · ') || 'no flags'}
            </div>
            <div className="muted small">
              {Object.entries(s.quests).map(([k, q]) => `${k}: ${q.status}/${q.stage}`).join(' · ') || 'no quests'}
            </div>
            <div className="muted small">resources: {Object.entries(s.town.resources).map(([k, v]) => `${k} ${v}`).join(' · ')}</div>
            <div className="muted small">storage: {Object.entries(s.town.storage).map(([k, v]) => `${k} ×${v}`).join(' · ') || 'empty'}</div>
          </section>
        </>
      )}
    </div>
  );
}
