/**
 * Our own values stored on the current browser history entry, next to the ClientRouter's (index, scroll).
 * A value lives and dies with its entry: it is back after Back/Forward or a reload and absent on a new visit.
 */

const currentState = (): Record<string, unknown> | null => {
  const state: unknown = window.history.state;
  return state !== null && typeof state === "object" ? Object.fromEntries(Object.entries(state)) : null;
};

export const readHistoryValue = (key: string): unknown => currentState()?.[key];

/**
 * Sets (or with `undefined` removes) a value on the current entry. Returns false when the entry has no router
 * state yet: writing one would hide the router's index from it.
 */
export const writeHistoryValue = (key: string, value: unknown): boolean => {
  const state = currentState();
  if (!state) return false;
  if (value === undefined) delete state[key];
  else state[key] = value;
  window.history.replaceState(state, "");
  return true;
};
