// Striker FC — store/useMatchHudStore.ts
// Throttled (20Hz) HUD state (Blueprint 02). The GameLoop calls pushHudSnapshot at
// most every 50ms; direct setState calls from React events are also supported.

import type { Mentality, TeamSide } from '../core/types';
import { createStore } from './createStore';

export interface HudState {
  homeScore: number;
  awayScore: number;
  minute: number;
  second: number;
  period: number;
  possessionSide: TeamSide;
  mentality: Mentality;
  bannerText: string | null;
  fps: number;
  tickCount: number;
  accumulator: number;
  alpha: number;
  simTimeSeconds: number;
  loopRunning: boolean;
  setMentality: (mentality: Mentality) => void;
  showBanner: (text: string | null) => void;
  pushHudSnapshot: (snapshot: Partial<HudState>) => void;
}

export const hudStore = createStore<HudState>({
  homeScore: 0,
  awayScore: 0,
  minute: 0,
  second: 0,
  period: 1,
  possessionSide: 'HOME',
  mentality: 'BALANCED',
  bannerText: null,
  fps: 0,
  tickCount: 0,
  accumulator: 0,
  alpha: 0,
  simTimeSeconds: 0,
  loopRunning: false,
  setMentality: (mentality) => {
    hudStore.setState({ mentality });
  },
  showBanner: (bannerText) => {
    hudStore.setState({ bannerText });
  },
  pushHudSnapshot: (snapshot) => {
    hudStore.setState(snapshot);
  },
});

export function useMatchHudStore<S>(selector: (state: HudState) => S): S {
  return hudStore.useStore(selector);
}
