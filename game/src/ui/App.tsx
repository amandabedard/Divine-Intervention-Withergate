import { useEffect } from 'react';
import { useStore } from '../bridge/store';
import { session } from '../core/session';
import { DebugPanel } from './debug';
import { DialogBox, TalkMenu } from './dialog';
import { Hud, Toasts } from './hud';
import { dispatchNav, keyToNav, startGamepadPolling } from './nav';
import { Panel } from './panels';
import { CreationScreen, TitleScreen } from './screens';

/** Modes where menus own the input (the world scene reads the keyboard itself otherwise). */
const menuActive = (): boolean => {
  const m = session.uiState().mode;
  return m !== 'world' && m !== 'boot' && m !== 'creation';
};

export function App() {
  const snap = useStore();
  const { ui, state } = snap;

  useEffect(() => {
    startGamepadPolling(menuActive);

    // Buttons must not keep keyboard focus, or Enter/Space would fire them twice
    // (native click plus the menu's confirm). Mouse clicks still work.
    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('button')) e.preventDefault();
    };

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (e.key === '`' && !typing) {
        e.preventDefault();
        if (!e.repeat) session.toggleDebug();
        return;
      }
      if (typing) return;
      const u = session.uiState();
      if (u.mode === 'world' || u.mode === 'boot') return;
      if (u.mode === 'creation') {
        if (e.key === 'Escape' && !e.repeat) session.backToTitle();
        return;
      }

      // Number hotkeys for the talk menu and dialog choices.
      if (!e.repeat && u.mode === 'dialog') {
        const n = Number(e.key);
        if (n >= 1 && n <= 9) {
          if (u.dialogActive && u.choices) {
            const choice = u.choices.filter((c) => !c.locked)[n - 1];
            if (choice) session.chooseOption(choice.index);
            e.preventDefault();
            return;
          }
          if (!u.dialogActive && u.talk?.view === 'menu') {
            const actions = [
              () => session.chat(),
              () => session.setTalkView('topics'),
              () => session.flirt(),
              () => session.setTalkView('gifts'),
              () => session.exitTalk(),
            ];
            actions[n - 1]?.();
            e.preventDefault();
            return;
          }
        }
      }

      const nav = keyToNav(e);
      if (!nav) return;
      // Held arrows may repeat to scroll long lists; confirm and cancel never repeat.
      if (e.repeat && nav !== 'up' && nav !== 'down' && nav !== 'left' && nav !== 'right') return;
      e.preventDefault();
      dispatchNav(nav);
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <>
      {ui.mode === 'boot' && (
        <div className="screen center">
          <div className="loading">Loading…</div>
        </div>
      )}
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
