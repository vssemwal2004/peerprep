// Student features the Master Admin can put a Prep Coin price on. A feature that is not priced
// (or priced 0) is free, unless it declares a `defaultPrice` that applies until a price is saved.
// Prep Coin never affects Prep Score or rank.
export const COIN_FEATURES = Object.freeze([
  Object.freeze({ key: 'ai_interview.start', label: 'AI interview', detail: 'Starting a new AI interview. Resuming one already started is free.' }),
  Object.freeze({ key: 'mock_interview.join', label: 'Mock interview', detail: 'Joining an open mock interview event. Events a coordinator assigned are always free.' }),
  // Each check makes one paid Gemini call, so it is never free by default.
  Object.freeze({ key: 'resume.jd_match', label: 'Resume JD Match (ANVI)', detail: 'One ANVI check of a résumé against a job description. Refunded automatically if the check fails; a repeat of the same résumé and job within 24 hours is free.', defaultPrice: 10 }),
]);
export const COIN_FEATURE_KEYS = Object.freeze(COIN_FEATURES.map((feature) => feature.key));
export const MAX_PRICE = 100_000;
export const MAX_FREE_PER_MONTH = 1_000;
