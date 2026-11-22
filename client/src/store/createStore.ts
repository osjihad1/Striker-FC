// Striker FC — store/createStore.ts
// Minimal strictly-typed observable store (zustand-style API, zero dependencies).

import { useSyncExternalStore } from 'react';

export interface Store<T extends object> {
  getState: () => T;
  setState: (partial: Partial<T>) => void;
  subscribe: (listener: () => void) => () => void;
  useStore: <S>(selector: (state: T) => S) => S;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  const getState = (): T => state;

  const setState = (partial: Partial<T>): void => {
    state = { ...state, ...partial };
    for (const listener of [...listeners]) listener();
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  function useStore<S>(selector: (s: T) => S): S {
    return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
  }

  return { getState, setState, subscribe, useStore };
}
