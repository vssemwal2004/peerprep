// Fired after a paid action so the header balance refreshes without another page load.
export const PREP_COIN_CHANGED = 'prepcoin:changed';
export const announcePrepCoinChange = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(PREP_COIN_CHANGED)); };
