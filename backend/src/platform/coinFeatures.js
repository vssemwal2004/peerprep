// Student features the Master Admin can put a Prep Coin price on. A feature that is not priced
// (or priced 0) is free. Prep Coin never affects Prep Score or rank.
export const COIN_FEATURES = Object.freeze([
  Object.freeze({ key: 'ai_interview.start', label: 'AI interview', detail: 'Starting a new AI interview. Resuming one already started is free.' }),
  Object.freeze({ key: 'mock_interview.join', label: 'Mock interview', detail: 'Joining an open mock interview event. Events a coordinator assigned are always free.' }),
]);
export const COIN_FEATURE_KEYS = Object.freeze(COIN_FEATURES.map((feature) => feature.key));
export const MAX_PRICE = 100_000;
export const MAX_FREE_PER_MONTH = 1_000;
