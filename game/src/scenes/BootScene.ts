import Phaser from 'phaser';
import { EMPTY_INDEX, EMPTY_MANIFEST, IMAGE_ASSET_KINDS } from '@withergate/shared';
import type { AssetManifest, GeneratedIndex } from '@withergate/shared';
import { bus } from '../bridge/bus';
import { store } from '../bridge/store';
import { session } from '../core/session';

/** Loads the generated asset index, the asset manifest and every image, then hands over to the UI. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    bus.on('world.enter', (data) => {
      if (this.scene.isActive('world')) return;
      this.scene.launch('world', data);
    });

    const fetchJson = <T>(url: string, fallback: T): Promise<T> =>
      fetch(url)
        .then((r) => (r.ok ? (r.json() as Promise<T>) : fallback))
        .catch(() => fallback);

    Promise.all([
      fetchJson<GeneratedIndex>('/generated/index.json', EMPTY_INDEX),
      fetchJson<AssetManifest>('/art/manifest.json', EMPTY_MANIFEST),
    ]).then(([index, manifest]) => {
      store.setAssets(index, manifest);
      for (const [set, info] of Object.entries(index.sprites)) {
        this.load.spritesheet(`sprite:${set}`, `/${info.image}`, {
          frameWidth: info.frameWidth,
          frameHeight: info.frameHeight,
        });
      }
      for (const a of manifest.assets) {
        if (IMAGE_ASSET_KINDS.includes(a.kind)) this.load.image(`asset:${a.id}`, `/art/${a.file}`);
      }
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        for (const [set, info] of Object.entries(index.sprites)) {
          for (const [name, anim] of Object.entries(info.animations)) {
            const key = `${set}:${name}`;
            if (this.anims.exists(key)) continue;
            this.anims.create({
              key,
              frames: this.anims.generateFrameNumbers(`sprite:${set}`, { start: anim.from, end: anim.to }),
              frameRate: anim.fps,
              repeat: -1,
            });
          }
        }
        session.assetsReady();
      });
      this.load.start();
    });
  }
}
