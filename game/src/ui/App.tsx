import { useEffect } from 'react';
import { useStore } from '../bridge/store';
import { session } from '../core/session';
import { DebugPanel } from './debug';
import { DialogBox, TalkMenu } from './dialog';
import { Hud, Toasts } from './hud';
import { Panel } from './panels';
import { CreationScreen, TitleScreen } from './screens';

export function App() {
  const snap = useStore();
  const { ui, state } = snap;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === '`' && !typing) {
        e.preventDefault();
        session.toggleDebug();
        return;
      }
      if (typing) return;
      const u = session.uiState();
      if (u.mode === 'dialog') {
        if (u.dialogActive) {
          if (u.choices) {
            const n = Number(e.key);
            if (n >= 1 && n <= 9) {
              const choice = u.choices.filter((c) => !c.locked)[n - 1];
              if (choice) session.chooseOption(choice.index);
            }
            return;
          }
          if (e.key === 'e' || e.key === 'E' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            session.advanceDialog();
          }
          return;
        }
        if (u.talk) {
          if (e.key === 'Escape') {
            if (u.talk.view === 'menu') session.exitTalk();
            else session.setTalkView('menu');
            return;
          }
          if (u.talk.view === 'menu') {
            const n = Number(e.key);
            if (n === 1) session.chat();
            else if (n === 2) session.setTalkView('topics');
            else if (n === 3) session.flirt();
            else if (n === 4) session.setTalkView('gifts');
            else if (n === 5) session.exitTalk();
          }
        }
        return;
      }
      if (u.mode === 'panel' && e.key === 'Escape') session.closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {ui.mode === 'boot' && <div className="screen center"><div className="loading">Loading…</div></div>}
      {ui.mode === 'title' && <TitleScreen />}
      {ui.mode === 'creation' && <CreationScreen />}
      {state && ui.mode !== 'title' && ui.mode !== 'creation' && <Hud snap={snap} />}
      {ui.talk && !ui.dialogActive && <TalkMenu snap={snap} />}
      {ui.dialogActive && <DialogBox snap={snap} />}
      {ui.mode === 'panel' && ui.panel && <Panel kind={ui.panel} snap={snap} />}
      <Toasts toasts={ui.toasts} />
      {ui.debugOpen && <DebugPanel snap={snap} />}
    </>
  );
}
