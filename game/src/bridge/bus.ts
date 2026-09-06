import type { StageStep } from '@withergate/shared';

export interface EnterWorldData {
  map: string;
  spawn?: string;
  x?: number;
  facing?: 'left' | 'right';
}

export interface Events {
  /** Start or switch the world scene to a map. */
  'world.enter': EnterWorldData;
  /** Content bundle replaced (hot reload). */
  'content.reloaded': undefined;
  /** Day or phase changed; scenes re-place NPCs and retint. */
  'time.changed': undefined;
  /** A cutscene stage direction for the world scene to perform. */
  stage: { step: StageStep; done: () => void };
  /** Villager positions may have changed (recruited, override). */
  'npc.refresh': undefined;
}

type Handler<T> = (payload: T) => void;

class Bus {
  private handlers = new Map<keyof Events, Set<Handler<any>>>();

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K] extends undefined ? [] : [Events[K]]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of [...set]) h(args[0]);
  }
}

export const bus = new Bus();
