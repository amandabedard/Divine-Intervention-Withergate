import type { GameState } from './state';
import { SAVE_VERSION } from './state';

export interface SaveSlotInfo {
  slot: number;
  savedAt: string;
  name: string;
  day: number;
  phase: string;
  map: string;
}

const KEY = (slot: number) => `withergate.save.${slot}`;
export const SLOTS = [1, 2, 3] as const;

export function saveToSlot(slot: number, state: GameState): void {
  const payload = { version: SAVE_VERSION, savedAt: new Date().toISOString(), state };
  localStorage.setItem(KEY(slot), JSON.stringify(payload));
}

export function loadSlot(slot: number): GameState | null {
  const raw = localStorage.getItem(KEY(slot));
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as { version: number; state: GameState };
    return migrate(payload.state);
  } catch {
    return null;
  }
}

export function listSlots(): SaveSlotInfo[] {
  const out: SaveSlotInfo[] = [];
  for (const slot of SLOTS) {
    const raw = localStorage.getItem(KEY(slot));
    if (!raw) continue;
    try {
      const payload = JSON.parse(raw) as { savedAt: string; state: GameState };
      out.push({
        slot,
        savedAt: payload.savedAt,
        name: payload.state.player.name,
        day: payload.state.time.day,
        phase: payload.state.time.phase,
        map: payload.state.where.map,
      });
    } catch {
      // ignore corrupt slot
    }
  }
  return out;
}

export function deleteSlot(slot: number): void {
  localStorage.removeItem(KEY(slot));
}

function migrate(state: GameState): GameState {
  // Future save-format migrations go here, keyed on state.version.
  state.version = SAVE_VERSION;
  return state;
}
