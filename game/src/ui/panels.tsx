// Town screens: Quarters (bed, loadout, satchel, storage, residents, build), Living Quarters,
// the General Store, the Tavern, the build menu, built facilities, crafting and the Shrine.
// Every screen is a keyboard-navigable list built on MenuPanel.
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DOMAINS, DOMAIN_LABELS, RESOURCES, tierForPoints } from '@withergate/shared';
import type { Resource } from '@withergate/shared';
import type { PanelKind, Snapshot } from '../bridge/store';
import { TIER_LABELS } from '../core/relationships';
import { SLOTS } from '../core/save';
import { session } from '../core/session';
import { faithLevel, maxEnergy, maxHp, residents, villagerState } from '../core/state';
import * as town from '../core/town';
import { ExpeditionPlanPanel } from './expedition';
import { canAscend } from '../core/ending';
import { useMenuNav } from './nav';

interface Item {
  label: string;
  note?: string;
  disabled?: boolean;
  danger?: boolean;
  run: () => void;
}

function MenuPanel({
  title,
  subtitle,
  items,
  onCancel,
  resetKey,
  children,
}: {
  title: string;
  subtitle?: string;
  items: Item[];
  onCancel: () => void;
  resetKey?: unknown;
  children?: ReactNode;
}) {
  const nav = useMenuNav({
    items,
    isDisabled: (it) => !!it.disabled,
    onSelect: (it) => it.run(),
    onCancel,
    resetKey,
  });
  return (
    <>
      <h2>{title}</h2>
      {subtitle && <p className="muted">{subtitle}</p>}
      {children}
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

const costText = (cost: Partial<Record<string, number>>) =>
  Object.entries(cost)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([r, n]) => `${n} ${r}`)
    .join(', ') || 'free';

export function Panel({ kind, arg, snap }: { kind: PanelKind; arg: string | null; snap: Snapshot }) {
  const close = () => session.closePanel();
  let body: ReactNode;
  switch (kind) {
    case 'quarters': body = <QuartersPanel />; break;
    case 'bed': body = <BedPanel />; break;
    case 'loadout': body = <LoadoutPanel snap={snap} />; break;
    case 'satchel': body = <SatchelPanel snap={snap} />; break;
    case 'storage': body = <StoragePanel snap={snap} />; break;
    case 'residents': body = <ResidentsPanel snap={snap} />; break;
    case 'living_quarters': body = <LivingQuartersPanel snap={snap} />; break;
    case 'general_store': body = <StorePanel snap={snap} />; break;
    case 'tavern': body = <TavernPanel snap={snap} />; break;
    case 'build': body = <BuildPanel snap={snap} slot={arg} />; break;
    case 'facility': body = <FacilityPanel snap={snap} facility={arg ?? ''} />; break;
    case 'craft': body = <CraftPanel snap={snap} facility={arg} />; break;
    case 'shrine': body = <ShrinePanel snap={snap} />; break;
    case 'expedition_plan': body = <ExpeditionPlanPanel snap={snap} />; break;
    case 'journal': body = <JournalPanel snap={snap} />; break;
    default: body = <Placeholder kind={kind} snap={snap} />;
  }
  return (
    <div className="screen dim" onClick={close}>
      <div className="card panel" onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>
  );
}

// --- Quarters ------------------------------------------------------------------

function QuartersPanel() {
  const items = useMemo<Item[]>(
    () => [
      { label: 'Bed', note: 'save · sleep', run: () => session.openPanel('bed') },
      { label: 'Loadout', note: 'weapon · powers', run: () => session.openPanel('loadout') },
      { label: 'Gift satchel', note: `${town.SATCHEL_SIZE} gifts for the road`, run: () => session.openPanel('satchel') },
      { label: 'Storage', note: 'what Withergate holds', run: () => session.openPanel('storage') },
      { label: 'Residents', note: 'escort someone home', run: () => session.openPanel('residents') },
      { label: 'Expedition', note: 'plan a journey from your desk', run: () => session.openPanel('expedition_plan') },
      { label: 'Journal', note: 'what you have set out to do', run: () => session.openPanel('journal') },
      { label: 'Build', note: 'raise a facility', run: () => session.openPanel('build') },
      { label: 'Close', run: () => session.closePanel() },
    ],
    [],
  );
  return <MenuPanel title="Your Quarters" subtitle="Your desk, your bed, and the plans for the town." items={items} onCancel={() => session.closePanel()} />;
}

function BedPanel() {
  const [slot, setSlot] = useState(1);
  const slots = session.slots();
  const info = (n: number) => slots.find((s) => s.slot === n);
  const items = useMemo<Item[]>(
    () => [
      ...SLOTS.map((n): Item => {
        const s = info(n);
        return {
          label: `${slot === n ? '● ' : '○ '}Slot ${n}`,
          note: s ? `${s.name} · day ${s.day} (${s.phase})` : 'empty',
          run: () => setSlot(n),
        };
      }),
      { label: 'Save', note: 'no time passes', run: () => { session.save(slot); session.closePanel(); } },
      { label: 'Sleep & save', note: 'until morning', run: () => session.sleepAndSave(slot) },
      { label: 'Load', disabled: !info(slot), run: () => session.load(slot) },
      { label: 'Cancel', run: () => session.closePanel() },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slot, slots.length],
  );
  return <MenuPanel title="Your bed" subtitle="Save without losing the day, or sleep until morning and save." items={items} onCancel={() => session.closePanel()} />;
}

function LoadoutPanel({ snap }: { snap: Snapshot }) {
  const s = snap.state!;
  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    list.push({ label: 'Bare hands', note: s.player.weaponId === null ? 'equipped' : 'blunt ×0.7', run: () => session.town.equipWeapon(null) });
    for (const id of s.player.weapons) {
      const w = snap.content.weapons[id];
      if (!w) continue;
      list.push({
        label: w.name,
        note: `${s.player.weaponId === id ? 'equipped · ' : ''}${w.damage_type} ×${w.power}`,
        run: () => session.town.equipWeapon(id),
      });
    }
    for (const id of s.player.powers) {
      const p = snap.content.powers[id];
      if (!p) continue;
      const held = s.player.equippedPowers.includes(id);
      list.push({
        label: p.name,
        note: p.kind === 'combat' ? `${held ? 'held' : 'not held'} · ${p.cost} grace` : 'always with you',
        run: () => session.town.toggleEquip(id),
      });
    }
    list.push({ label: 'Back', run: () => session.openPanel('quarters') });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.version]);
  return (
    <MenuPanel title="Loadout" subtitle={`One weapon, up to ${town.MAX_EQUIPPED_POWERS} powers held for battle.`} items={items} onCancel={() => session.openPanel('quarters')} />
  );
}

function SatchelPanel({ snap }: { snap: Snapshot }) {
  const s = snap.state!;
  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    s.player.satchel.forEach((id, i) => {
      list.push({ label: `Take out ${snap.content.items[id]?.name ?? id}`, note: 'in satchel', run: () => session.town.satchelRemove(i) });
    });
    for (const [id, n] of Object.entries(s.town.storage)) {
      if (n <= 0 || snap.content.items[id]?.kind !== 'gift') continue;
      list.push({
        label: `Pack ${snap.content.items[id]!.name}`,
        note: `${n} in storage`,
        disabled: s.player.satchel.length >= town.SATCHEL_SIZE,
        run: () => session.town.satchelAdd(id),
      });
    }
    list.push({ label: 'Back', run: () => session.openPanel('quarters') });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.version]);
  return (
    <MenuPanel
      title="Gift satchel"
      subtitle={`${s.player.satchel.length} of ${town.SATCHEL_SIZE} packed. Gifts in the satchel can be given anywhere.`}
      items={items}
      onCancel={() => session.openPanel('quarters')}
    />
  );
}

function StoragePanel({ snap }: { snap: Snapshot }) {
  const s = snap.state!;
  const items = useMemo<Item[]>(() => [{ label: 'Back', run: () => session.openPanel('quarters') }], []);
  return (
    <MenuPanel title="Storage" items={items} onCancel={() => session.openPanel('quarters')}>
      <div className="rows">
        {RESOURCES.map((r) => (
          <div key={r} className="kv">
            <span>{r}</span>
            <b>{s.town.resources[r]}</b>
          </div>
        ))}
        {Object.entries(s.town.storage)
          .filter(([, n]) => n > 0)
          .map(([id, n]) => (
            <div key={id} className="kv">
              <span>{snap.content.items[id]?.name ?? id}</span>
              <b>×{n}</b>
            </div>
          ))}
        {s.player.satchel.length > 0 && (
          <div className="kv">
            <span>satchel</span>
            <b>{s.player.satchel.map((id) => snap.content.items[id]?.name ?? id).join(', ')}</b>
          </div>
        )}
      </div>
    </MenuPanel>
  );
}

function ResidentsPanel({ snap }: { snap: Snapshot }) {
  const s = snap.state!;
  const [confirm, setConfirm] = useState<string | null>(null);
  const ctx = session.ctx();
  const items = useMemo<Item[]>(() => {
    if (confirm) {
      const name = snap.content.villagers[confirm]?.profile.name ?? confirm;
      const days = town.routeDays(ctx, snap.content.villagers[confirm]?.profile.home_town ?? 'none');
      return [
        { label: `Escort ${name} home`, note: `${days} day${days === 1 ? '' : 's'} on the road`, danger: true, run: () => session.town.escortHome(confirm) },
        { label: 'Back', run: () => setConfirm(null) },
      ];
    }
    const list: Item[] = residents(s).map((id) => {
      const p = snap.content.villagers[id]?.profile;
      const st = town.residentStatus(ctx, id);
      const rel = villagerState(s, snap.content, id);
      return {
        label: p?.name ?? id,
        note: rel.unhappy ? `leaving in ${rel.unhappy.daysLeft} day${rel.unhappy.daysLeft === 1 ? '' : 's'}` : st.ok ? 'settled' : st.reasons[0]?.text,
        run: () => setConfirm(id),
      };
    });
    list.push({ label: 'Back', run: () => session.openPanel('quarters') });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.version, confirm]);
  return (
    <MenuPanel
      title="Residents"
      subtitle={residents(s).length ? 'Choose someone to walk home. It is as if you never recruited them.' : 'Nobody lives here yet.'}
      items={items}
      resetKey={confirm}
      onCancel={() => (confirm ? setConfirm(null) : session.openPanel('quarters'))}
    />
  );
}

// --- Living Quarters -----------------------------------------------------------

function LivingQuartersPanel({ snap }: { snap: Snapshot }) {
  const s = snap.state!;
  const ctx = session.ctx();
  const items = useMemo<Item[]>(() => [{ label: 'Close', run: () => session.closePanel() }], []);
  const res = residents(s);
  const known = Object.values(snap.content.villagers).filter((v) => v.profile.recruit && villagerState(s, snap.content, v.profile.id).met && !res.includes(v.profile.id));
  const readinessText: Record<town.RecruitReadiness, string> = {
    resident: 'lives here',
    gone: 'gone for good',
    ready: 'ready to ask',
    not_ready: 'not yet',
    closed: 'will not come',
    full: 'no room',
    not_recruitable: '',
  };
  return (
    <MenuPanel title="Living Quarters" subtitle={`${res.length} of ${town.MAX_RESIDENTS} beds taken.`} items={items} onCancel={() => session.closePanel()}>
      <div className="rows">
        {res.map((id) => {
          const p = snap.content.villagers[id]!.profile;
          const rel = villagerState(s, snap.content, id);
          const st = town.residentStatus(ctx, id);
          return (
            <div key={id} className="kv">
              <span>
                <b>{p.name}</b> <small className="muted">{p.profession} · {TIER_LABELS[tierForPoints(rel.friendship)]} · energy {rel.energy}/{p.energy ?? 6}</small>
              </span>
              <span className={st.ok ? 'status-ok' : 'status-bad'}>{rel.unhappy ? `leaving in ${rel.unhappy.daysLeft}d` : st.ok ? 'settled' : st.reasons[0]?.text}</span>
            </div>
          );
        })}
        {!res.length && <div className="muted">Empty beds and a lot of horizon.</div>}
        {known.length > 0 && <h4>People you have met</h4>}
        {known.map((v) => (
          <div key={v.profile.id} className="kv">
            <span>
              <b>{v.profile.name}</b> <small className="muted">{v.profile.profession} · {v.profile.home_town}</small>
            </span>
            <span className="muted">{readinessText[town.recruitReadiness(ctx, v.profile.id)]}</span>
          </div>
        ))}
      </div>
    </MenuPanel>
  );
}

// --- General Store ---------------------------------------------------------------

function StorePanel({ snap }: { snap: Snapshot }) {
  const s = snap.state!;
  type View = { kind: 'offer'; index: number } | { kind: 'sell' } | { kind: 'sell_one'; resource: Resource } | null;
  const [view, setView] = useState<View>(null);
  const ctx = session.ctx();
  const nameOf = (item: string) => snap.content.items[item]?.name ?? item;
  const items = useMemo<Item[]>(() => {
    const offers = town.storeOffers(ctx);
    const gold = s.town.resources.gold;
    const list: Item[] = [];
    if (view?.kind === 'offer') {
      const o = offers[view.index];
      if (o) {
        const affordable = Math.floor(gold / o.price);
        for (const n of [1, 5]) {
          if (n > 1 && o.qty < n) continue;
          list.push({ label: `Buy ${n}`, note: `${o.price * n} gold`, disabled: gold < o.price * n || o.qty < n, run: () => session.town.buy(view.index, n) });
        }
        const all = Math.min(o.qty, affordable);
        if (all > 1) list.push({ label: `Buy all ${all}`, note: `${o.price * all} gold`, run: () => session.town.buy(view.index, all) });
      }
      list.push({ label: 'Back', run: () => setView(null) });
      return list;
    }
    if (view?.kind === 'sell_one') {
      const r = view.resource;
      for (const n of [1, 5, 10]) {
        list.push({ label: `Sell ${n}`, note: `${town.sellPrice(ctx, r, n)} gold`, disabled: s.town.resources[r] < n, run: () => session.town.sell(r, n) });
      }
      if (s.town.resources[r] > 10) list.push({ label: `Sell all ${s.town.resources[r]}`, note: `${town.sellPrice(ctx, r, s.town.resources[r])} gold`, run: () => session.town.sell(r, s.town.resources[r]) });
      list.push({ label: 'Back', run: () => setView({ kind: 'sell' }) });
      return list;
    }
    if (view?.kind === 'sell') {
      for (const r of RESOURCES) {
        if (r === 'gold' || !snap.content.economy.prices[r] || !s.town.resources[r]) continue;
        list.push({ label: r, note: `have ${s.town.resources[r]} · ${town.sellPrice(ctx, r)} gold each`, run: () => setView({ kind: 'sell_one', resource: r }) });
      }
      if (!list.length) list.push({ label: '(nothing to sell)', disabled: true, run: () => undefined });
      list.push({ label: 'Back', run: () => setView(null) });
      return list;
    }
    offers.forEach((o, index) => {
      list.push({
        label: nameOf(o.item),
        note: o.qty ? `${o.qty} left · ${o.price} gold each` : 'sold out this week',
        disabled: !o.qty || gold < o.price,
        run: () => setView({ kind: 'offer', index }),
      });
    });
    if (!offers.length) list.push({ label: '(empty shelves)', disabled: true, run: () => undefined });
    list.push({ label: 'Sell…', note: 'the town pays half of what things are worth', run: () => setView({ kind: 'sell' }) });
    list.push({ label: 'Close', run: () => session.closePanel() });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.version, view]);
  const week = town.weekOf(s.time.day);
  const subtitle =
    view?.kind === 'offer'
      ? `${s.town.resources.gold} gold. ${nameOf(town.storeOffers(ctx)[view.index]?.item ?? '')}.`
      : view
        ? `${s.town.resources.gold} gold. Selling.`
        : `Week ${week}'s shelves and prices. ${s.town.resources.gold} gold. Nothing here is a bargain; some weeks less so.`;
  return (
    <MenuPanel
      title="General Store"
      subtitle={subtitle}
      items={items}
      resetKey={JSON.stringify(view)}
      onCancel={() => (view ? setView(view.kind === 'sell_one' ? { kind: 'sell' } : null) : session.closePanel())}
    />
  );
}

// --- Tavern ------------------------------------------------------------------------

function TavernPanel({ snap }: { snap: Snapshot }) {
  const ctx = session.ctx();
  const items = useMemo<Item[]>(() => {
    const list: Item[] = town.tavernActivities(ctx).map(({ activity, blocked }) => ({
      label: activity.label,
      note: blocked ?? `${activity.description}${activity.gold ? ` · ${activity.gold} gold` : ''}${activity.cost === 'phase' ? ' · takes the evening' : ''}`,
      disabled: !!blocked,
      run: () => session.town.activity(activity.id),
    }));
    list.push({ label: 'Leave', run: () => session.closePanel() });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.version]);
  return <MenuPanel title="Tavern" subtitle="Warm, loud, and the only place in Withergate that never quite closes." items={items} onCancel={() => session.closePanel()} />;
}

// --- Building ------------------------------------------------------------------------

function BuildPanel({ snap, slot }: { snap: Snapshot; slot: string | null }) {
  const [chosenSlot, setChosenSlot] = useState<string | null>(slot);
  const ctx = session.ctx();
  const free = town.freeSlots(ctx);
  const items = useMemo<Item[]>(() => {
    if (!chosenSlot) {
      const list: Item[] = free.map((id) => ({ label: id.replace('_', ' '), note: 'empty slot', run: () => setChosenSlot(id) }));
      if (!free.length) list.push({ label: 'No free slots', note: 'demolish something first', disabled: true, run: () => undefined });
      list.push({ label: 'Back', run: () => session.closePanel() });
      return list;
    }
    const list: Item[] = town.optionalFacilities(ctx).map((f) => {
      const err = town.canBuild(ctx, f.id, chosenSlot);
      const cost = town.buildCost(ctx, f.id);
      return {
        label: f.name,
        note: err ?? `${costText(cost)} · ${town.buildDays(ctx, f.id)} days`,
        disabled: !!err,
        run: () => session.town.build(f.id, chosenSlot),
      };
    });
    list.push({ label: 'Back', run: () => (slot ? session.closePanel() : setChosenSlot(null)) });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.version, chosenSlot]);
  const f = chosenSlot ? undefined : undefined;
  void f;
  return (
    <MenuPanel
      title="Build"
      subtitle={chosenSlot ? `Raise a facility in ${chosenSlot.replace('_', ' ')}. Withergate holds ${costText(snap.state!.town.resources)}.` : 'Choose where to build.'}
      items={items}
      resetKey={chosenSlot}
      onCancel={() => (chosenSlot && !slot ? setChosenSlot(null) : session.closePanel())}
    />
  );
}

function describeEffect(e: Record<string, unknown>): string {
  switch (e.type) {
    case 'resource_income': return `+${e.amount} ${e.resource} every morning`;
    case 'caravan_safety': return `caravans ${e.percent}% safer`;
    case 'incursion_defense': return `+${e.amount} defence against incursions`;
    case 'preview_nodes': return `see ${e.columns} more column${e.columns === 1 ? '' : 's'} of the road ahead`;
    case 'store_rates': return `store prices ${e.percent}% lower`;
    case 'energy_max': return `+${e.amount} energy`;
    case 'recovery_speed': return `recover ${e.days} day${e.days === 1 ? '' : 's'} faster`;
    case 'faith_gain': return `+${e.percent}% faith from deeds`;
    case 'tavern_quality': return 'better evenings at the tavern';
    case 'unlock_action': return `unlocks: ${String(e.action).replace(/_/g, ' ')}`;
    default: return String(e.type);
  }
}

function FacilityPanel({ snap, facility }: { snap: Snapshot; facility: string }) {
  const [confirm, setConfirm] = useState(false);
  const ctx = session.ctx();
  const info = town.facilityInfo(ctx, facility);
  const items = useMemo<Item[]>(() => {
    if (!info) return [{ label: 'Close', run: () => session.closePanel() }];
    if (confirm) {
      return [
        { label: `Tear down the ${info.facility.name}`, note: 'residents who work here may leave', danger: true, run: () => session.town.demolish(facility) },
        { label: 'Keep it', run: () => setConfirm(false) },
      ];
    }
    const list: Item[] = [];
    if (town.craftables(ctx, facility).length) list.push({ label: 'Craft', note: 'weapons and gifts from the stores', run: () => session.openPanel('craft', facility) });
    if (!info.facility.fixed) list.push({ label: 'Demolish', run: () => setConfirm(true) });
    list.push({ label: 'Close', run: () => session.closePanel() });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.version, confirm, facility]);
  if (!info) return <MenuPanel title="Nothing here" items={items} onCancel={() => session.closePanel()} />;
  return (
    <MenuPanel title={info.facility.name} subtitle={info.facility.description} items={items} resetKey={confirm} onCancel={() => (confirm ? setConfirm(false) : session.closePanel())}>
      <div className="rows">
        {info.facility.effects.map((e, i) => (
          <div key={i} className="kv">
            <span>{describeEffect(e as Record<string, unknown>)}</span>
          </div>
        ))}
        <div className="kv">
          <span>workers</span>
          <b>{info.workers.length ? info.workers.map((id) => snap.content.villagers[id]?.profile.name ?? id).join(', ') : 'none yet'}</b>
        </div>
      </div>
    </MenuPanel>
  );
}

function CraftPanel({ snap, facility }: { snap: Snapshot; facility: string | null }) {
  const ctx = session.ctx();
  const items = useMemo<Item[]>(() => {
    const list: Item[] = town.craftables(ctx, facility ?? undefined).map((c) => ({
      label: c.name,
      note: c.blocked ?? `${costText(c.cost)} · ${c.kind}`,
      disabled: !!c.blocked,
      run: () => session.town.craft(c.kind, c.id),
    }));
    list.push({ label: 'Back', run: () => (facility ? session.openPanel('facility', facility) : session.closePanel()) });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.version, facility]);
  return <MenuPanel title="Craft" subtitle={`Withergate holds ${costText(snap.state!.town.resources)}.`} items={items} onCancel={() => (facility ? session.openPanel('facility', facility) : session.closePanel())} />;
}

// --- Shrine ----------------------------------------------------------------------------

function ShrinePanel({ snap }: { snap: Snapshot }) {
  const s = snap.state!;
  const ctx = session.ctx();
  const level = faithLevel(s, snap.content);
  const items = useMemo<Item[]>(() => {
    const powers = Object.values(snap.content.powers).filter((p) => p.kind !== 'companion');
    const list: Item[] = [];
    for (const axis of [...DOMAINS, undefined]) {
      for (const p of powers.filter((x) => x.domain === axis).sort((a, b) => a.tier - b.tier)) {
        const owned = s.player.powers.includes(p.id);
        const held = s.player.equippedPowers.includes(p.id);
        const blocked = owned ? null : town.canUnlockPower(ctx, p.id);
        const state = owned ? (p.kind === 'combat' ? (held ? 'held for battle' : 'known · not held') : 'always with you') : blocked ?? `${p.points} point${p.points === 1 ? '' : 's'}`;
        list.push({
          label: `${axis ? DOMAIN_LABELS[axis] : 'Other'} · ${p.name}`,
          note: `tier ${p.tier} · ${state}`,
          disabled: !owned && !!blocked,
          run: () => (owned ? session.town.toggleEquip(p.id) : session.town.unlockPower(p.id)),
        });
      }
    }
    const notYet = canAscend(ctx);
    list.push({ label: 'Return to the heavens', note: notYet ? 'not yet' : 'leave Duluma and take your title', disabled: !!notYet, danger: true, run: () => session.ascend() });
    list.push({ label: 'Close', run: () => session.closePanel() });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.version]);
  return (
    <MenuPanel
      title="Your shrine"
      subtitle={`Faith ${s.player.faith} (level ${level}) · ${s.player.skillPoints} skill point${s.player.skillPoints === 1 ? '' : 's'} to spend. Choose a power to understand it, or to hold or set it down.`}
      items={items}
      onCancel={() => session.closePanel()}
    />
  );
}

// --- fallback ---------------------------------------------------------------------------

function Placeholder({ kind, snap }: { kind: PanelKind; snap: Snapshot }) {
  const facility = snap.content.facilities[kind];
  const items = useMemo<Item[]>(() => [{ label: 'Close', run: () => session.closePanel() }], []);
  return (
    <MenuPanel title={facility?.name ?? kind.replace(/_/g, ' ')} subtitle={facility?.description} items={items} onCancel={() => session.closePanel()}>
      <p>Nothing to do here yet.</p>
    </MenuPanel>
  );
}

export const panelTitles = { maxHp, maxEnergy };

// --- Journal ---------------------------------------------------------------------

function JournalPanel({ snap }: { snap: Snapshot }) {
  const s = snap.state!;
  const entries = Object.entries(s.quests)
    .map(([id, q]) => ({ id, q, quest: snap.content.quests[id] }))
    .filter((e) => e.quest);
  const active = entries.filter((e) => e.q.status === 'active');
  const finished = entries.filter((e) => e.q.status !== 'active' && e.q.status !== 'not_started');
  const items = useMemo<Item[]>(() => [{ label: 'Close', run: () => session.closePanel() }], []);
  const describe = (e: (typeof entries)[number]) => {
    const quest = e.quest!;
    const idx = quest.stages.findIndex((st) => st.id === e.q.stage);
    const stage = quest.stages[idx];
    const notes = quest.stages.slice(0, Math.max(0, idx)).map((st) => quest.journal_notes?.[st.id]).filter(Boolean);
    return { quest, stage, notes };
  };
  return (
    <MenuPanel title="Journal" subtitle={active.length ? `${active.length} thing${active.length === 1 ? '' : 's'} on your mind.` : 'Nothing pressing.'} items={items} onCancel={() => session.closePanel()}>
      <div className="rows journal">
        {active.map((e) => {
          const { quest, stage, notes } = describe(e);
          // the giver was taken by the corruption: the quest waits, greyed, until they are brought back
          const giverGone = quest.giver !== 'none' && !!s.villagers[quest.giver]?.gone;
          return (
            <div key={e.id} className={`kv ${giverGone ? 'muted' : ''}`}>
              <b>{quest.title}</b>
              <small className="muted">{giverGone ? `${quest.type} · ${snap.content.villagers[quest.giver]?.profile.name ?? quest.giver} was lost to the corruption` : quest.type}</small>
              <div>{stage?.objective ?? quest.summary}</div>
              {notes.map((n, i) => (
                <div key={i} className="muted small">
                  {n}
                </div>
              ))}
            </div>
          );
        })}
        {finished.map((e) => (
          <div key={e.id} className="kv muted">
            <b>{e.quest!.title}</b>
            <small>{e.q.status}</small>
          </div>
        ))}
        {!entries.length && <div className="muted">No quests yet.</div>}
      </div>
    </MenuPanel>
  );
}
