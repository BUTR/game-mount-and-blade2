import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";

/**
 * Module-level state store persisting view state across profile switches.
 * Vortex unmounts the page during profile activation; retaining state here ensures
 * ongoing asynchronous operations (such as join flows or map downloads) continue tracking correctly
 * when the view remounts.
 */
const values = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

const read = <T>(key: string, initial: T | (() => T)): T => {
  if (!values.has(key)) {
    values.set(
      key,
      typeof initial === "function" ? (initial as () => T)() : initial,
    );
  }
  return values.get(key) as T;
};

/**
 * React hook mirroring `useState`, but persisted across component unmounts for the entire Vortex session.
 */
export const usePageState = <T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] => {
  const [value, setValue] = useState<T>(() => read(key, initial));

  // Synchronize on mount/subscription to catch state updates occurring between render and effect registration.
  // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
  const sync = useCallback((): void => setValue(values.get(key) as T), [key]);
  useEffect(() => {
    const keyListeners = listeners.get(key) ?? new Set();
    keyListeners.add(sync);
    listeners.set(key, keyListeners);
    sync();
    return () => {
      keyListeners.delete(sync);
    };
  }, [key, sync]);

  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      const previous = values.get(key) as T;
      const next =
        typeof action === "function"
          ? (action as (previous: T) => T)(previous)
          : action;
      if (Object.is(next, previous)) {
        return;
      }
      values.set(key, next);
      for (const listener of listeners.get(key) ?? []) {
        listener();
      }
    },
    [key],
  );

  return [value, update];
};

/**
 * Tracks collection slugs queried during this session to avoid redundant Nexus Mods lookups.
 */
export const requestedCollections = new Set<string>();
