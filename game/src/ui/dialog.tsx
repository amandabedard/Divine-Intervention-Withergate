import { useCallback, useEffect, useMemo, useState } from 'react';
import { tierForPoints } from '@withergate/shared';
import type { Marker } from '@withergate/shared';
import type { DialogChoice, Snapshot } from '../bridge/store';
import { ROMANCE_LABELS, TIER_LABELS } from '../core/relationships';
import { session } from '../core/session';
import { villagerState } from '../core/state';
import { onNav, useMenuNav } from './nav';

interface MenuItem {
  label: string;
  run: () => void;
  marker?: Marker;
  note?: string;
  hotkey?: number;
}

export function TalkMenu({ snap }: { snap: Snapshot }) {
  const talk = snap.ui.talk!;
  const view = talk.view;
  const bundle = snap.content.villagers[talk.villager];
  const rel = villagerState(snap.state!, snap.content, talk.villager);

  const items = useMemo<MenuItem[]>(() => {
    if (view === 'menu') {
      return [
        { label: 'Chat', hotkey: 1, run: () => session.chat() },
        { label: 'Discuss', hotkey: 2, run: () => session.setTalkView('topics') },
        { label: 'Flirt', hotkey: 3, run: () => session.flirt() },
        { label: 'Give gift', hotkey: 4, run: () => session.setTalkView('gifts') },
        { label: 'Exit', hotkey: 5, run: () => session.exitTalk() },
      ];
    }
    if (view === 'topics') {
      return [
        ...session.availableTopics(talk.villager).map((t) => ({ label: t.label, marker: t.marker, run: () => session.discuss(t.id) })),
        { label: 'Back', run: () => session.setTalkView('menu') },
      ];
    }
    return [
      ...session.giftOptions().map((g) => ({
        label: `${g.name}${g.count > 1 ? ` ×${g.count}` : ''}`,
        note: g.source,
        run: () => session.giveGift(g.id, g.source),
      })),
      { label: 'Back', run: () => session.setTalkView('menu') },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, talk.villager, snap.version]);

  const nav = useMenuNav({
    items,
    resetKey: view,
    onSelect: (item) => item.run(),
    onCancel: () => (view === 'menu' ? session.exitTalk() : session.setTalkView('menu')),
  });

  if (!bundle) return null;
  const tier = tierForPoints(rel.friendship);
  const romance = ROMANCE_LABELS[rel.romanceState];
  const bust = snap.assets.busts[bundle.profile.portrait_set ?? talk.villager]?.moods.neutral;

  return (
    <div className="talk">
      {bust && <img className="talk-bust" src={`/${bust}`} alt="" />}
      <div className="talk-card">
        <div className="talk-head">
          <b>{bundle.profile.name}</b>
          <span className="tier">
            {TIER_LABELS[tier]}
            {romance ? ` · ${romance}` : ''}
          </span>
        </div>
        <div className="talk-list">
          {view === 'topics' && items.length === 1 && <div className="muted">Nothing to discuss right now.</div>}
          {view === 'gifts' && items.length === 1 && (
            <div className="muted">You have nothing to give. Gifts come from your satchel, or from storage while in Withergate.</div>
          )}
          {items.map((it, i) => (
            <button key={`${view}:${i}`} {...nav.itemProps(i)} onClick={it.run}>
              {it.hotkey !== undefined && <kbd>{it.hotkey}</kbd>}
              {it.marker && it.marker !== 'none' && <span className={`marker ${it.marker}`}>{it.marker === 'quest' ? '!' : '♥'}</span>}
              {it.label}
              {it.note && <small className="muted"> ({it.note})</small>}
            </button>
          ))}
        </div>
        <div className="hint small">↑↓ choose · Enter select · Esc back</div>
      </div>
    </div>
  );
}

function useTypewriter(text: string, msPerChar = 16) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    if (!text) return;
    const id = window.setInterval(() => {
      setShown((n) => {
        if (n >= text.length) {
          window.clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, msPerChar);
    return () => window.clearInterval(id);
  }, [text, msPerChar]);
  const finish = useCallback(() => setShown(text.length), [text]);
  return { visible: text.slice(0, shown), done: shown >= text.length, finish };
}

export function DialogBox({ snap }: { snap: Snapshot }) {
  const { line, choices, roll } = snap.ui;
  const tw = useTypewriter(line?.text ?? '');
  const unlocked = useMemo<DialogChoice[]>(() => choices?.filter((c) => !c.locked) ?? [], [choices]);
  const showChoices = !!choices && (tw.done || !line);

  const nav = useMenuNav({
    items: unlocked,
    enabled: showChoices,
    resetKey: choices,
    onSelect: (c) => session.chooseOption(c.index),
  });

  const advance = useCallback(() => {
    if (roll) {
      session.advanceDialog();
      return;
    }
    if (line && !tw.done) {
      tw.finish();
      return;
    }
    if (!choices) session.advanceDialog();
  }, [roll, line, tw.done, tw.finish, choices]);

  useEffect(
    () =>
      onNav((a) => {
        if (a === 'confirm' && !showChoices) advance();
      }),
    [advance, showChoices],
  );

  useEffect(() => {
    if (!roll) return;
    const id = window.setTimeout(() => session.advanceDialog(), 1400);
    return () => window.clearTimeout(id);
  }, [roll]);

  return (
    <div className={`dialog ${line?.narrate ? 'narrate' : ''}`} onClick={advance}>
      {line?.bust && <img className="bust" src={line.bust} alt="" />}
      <div className="box">
        {line && !line.narrate && <div className="name">{line.name}</div>}
        {line && (
          <div className="text">
            {tw.visible}
            {!tw.done && <span className="caret">▌</span>}
          </div>
        )}
        {roll && (
          <div className={`roll ${roll.outcome}`}>
            {roll.stat} check: {roll.roll} + {roll.total - roll.roll} = {roll.total} vs {roll.dc} — {roll.outcome.replace('_', ' ')}
          </div>
        )}
        {showChoices && (
          <div className="choices" onClick={(e) => e.stopPropagation()}>
            {choices!.map((c) => {
              const ui = unlocked.indexOf(c);
              const focused = ui >= 0 && ui === nav.index;
              return (
                <button
                  key={c.index}
                  className={focused ? 'focused' : ''}
                  disabled={c.locked}
                  title={c.locked ? c.lockedText : ''}
                  onMouseEnter={() => ui >= 0 && nav.setIndex(ui)}
                  onClick={() => session.chooseOption(c.index)}
                >
                  {!c.locked && <kbd>{ui + 1}</kbd>}
                  {c.locked ? `🔒 ${c.lockedText ?? c.text}` : c.text}
                </button>
              );
            })}
          </div>
        )}
        {line && tw.done && !choices && !roll && <div className="continue">▼</div>}
        {line?.loc && snap.ui.debugOpen && <div className="loc">{line.loc}</div>}
      </div>
    </div>
  );
}
