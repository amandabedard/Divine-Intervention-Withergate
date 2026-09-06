import Phaser from 'phaser';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import content from 'virtual:withergate-content';
import { store } from './bridge/store';
import { session } from './core/session';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { App } from './ui/App';
import './ui/ui.css';

store.setContent(content);

export const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#0e0f14',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false },
  input: { keyboard: { capture: [] } },
  scene: [BootScene, WorldScene],
});

if (import.meta.env.DEV) {
  // Dev console handle: __wg.store.state, __wg.session.debug.*, __wg.game.scene.getScene('world')
  (window as unknown as { __wg: unknown }).__wg = { store, game, session };
}

createRoot(document.getElementById('ui')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.hot) {
  import.meta.hot.accept('virtual:withergate-content', (mod) => {
    if (mod?.default) store.setContent(mod.default);
  });
}
