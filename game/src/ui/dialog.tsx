import { useEffect, useState } from 'react';
import { tierForPoints } from '@withergate/shared';
import type { Snapshot } from '../bridge/store';
import { ROMANCE_LABELS, TIER_LABELS } from '../core/relationships';
import { session } from '../core/session';
import { villagerState } from '../core/state';

export const ADVANCE_EVENT = 'wg-advance';

export function TalkMenu({ snap }: { snap: Snapshot }) {
  const talk = snap.ui.talk!;
  const bundle = snap.content.villagers[talk.villager];
  const rel = villagerState(snap.state!, snap.content, talk.villager);
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
        {talk.view === 'menu' && (
          <div className="talk-actions">
            <button onClick={() => session.chat()}>
              <kbd>1</kbd> Chat
            </button>
            <button onClick={() => session.setTalkView('topics')}>
              <kbd>2</kbd> Discuss
            </button>
            <button onClick={() => session.flirt()}>
              <kbd>3</kbd> Flirt
            </button>
            <button onClick={() => session.setTalkView('gifts')}>
              <kbd>4</kbd> Give gift
            </button>
            <button className="subtle" onClick={() => session.exitTalk()}>
              <kbd>5</kbd> Exit
            </button>
          </div>
        )}
        {talk.view === 'topics' && <Topics villager={talk.villager} />}
        {talk.view === 'gifts' && <Gifts />}
      </div>
    </div>
  );
}

function Topics({ villager }: { villager: string }) {
  const topics = session.availableTopics(villager);
  return (
    <div className="talk-list">
      {topics.length === 0 && <div className="muted">Nothing to discuss right now.</div>}
      {topics.map((t) => (
        <button key={t.id} onClick={() => session.discuss(t.id)}>
          <span className={`marker ${t.marker}`}>{t.marker === 'quest' ? '!' : t.marker === 'heart' ? '♥' : ''}</span>
          {t.label}
        </button>
      ))}
      <button className="subtle" onClick={() => session.setTalkView('menu')}>
        Back
      </button>
    </div>
  );
}

function Gifts() {
  const options = session.giftOptions();
  return (
    <div className="talk-list">
      {options.length === 0 && <div className="muted">You have nothing to give. Gifts come from your satchel, or from storage while in Withergate.</div>}
      {options.map((o) => (
        <button key={`${o.source}:${o.id}`} onClick={() => session.giveGift(o.id, o.source)}>
          {o.name}
          {o.count > 1 ? ` ×${o.count}` : ''} <small className="muted">({o.source})</small>
        </button>
      ))}
      <button className="subtle" onClick={() => session.setTalkView('menu')}>
        Back
      </button>
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
  return { visible: text.slice(0, shown), done: shown >= text.length, finish: () => setShown(text.length) };
}

export function DialogBox({ snap }: { snap: Snapshot }) {
  const { line, choices, roll } = snap.ui;
  const tw = useTypewriter(line?.text ?? '');
  const showChoices = !!choices && (tw.done || !line);

  useEffect(() => {
    const onAdvance = () => {
      if (roll) return;
      if (line && !tw.done) tw.finish();
      else if (!choices) session.advanceDialog();
    };
    window.addEventListener(ADVANCE_EVENT, onAdvance);
    return () => window.removeEventListener(ADVANCE_EVENT, onAdvance);
  }, [line, choices, roll, tw]);

  useEffect(() => {
    if (!roll) return;
    const id = window.setTimeout(() => session.advanceDialog(), 1400);
    return () => window.clearTimeout(id);
  }, [roll]);

  const unlocked = choices?.filter((c) => !c.locked) ?? [];
  return (
    <div className={`dialog ${line?.narrate ? 'narrate' : ''}`} onClick={() => window.dispatchEvent(new Event(ADVANCE_EVENT))}>
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
              const n = unlocked.indexOf(c) + 1;
              return (
                <button key={c.index} disabled={c.locked} title={c.locked ? c.lockedText : ''} onClick={() => session.chooseOption(c.index)}>
                  {!c.locked && <kbd>{n}</kbd>}
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
