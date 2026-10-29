import { useCallback, useState } from 'react';
import { api } from '../../utils/api';
import { announcePrepCoinChange } from './prepCoinEvents';
import CostDialog from './CoinCostDialog';

/**
 * Wraps a paid student action. `checkout(run, { alreadyStarted, onSuccess, onError, onCancel })` runs it
 * at once when the feature is free or already paid for; otherwise the student first confirms the cost.
 * `run(expectedCost)` passes the cost to the API so a changed price is refused, never charged.
 * A shortfall or price change keeps the dialog open; any other failure goes to `onError`, and a
 * dismissed dialog (nothing run, nothing charged) goes to `onCancel`.
 */
export function usePrepCoinCheckout(featureKey) {
  const [state, setState] = useState(null);

  const attempt = useCallback(async (action, quote) => {
    setState({ action, quote, busy: true });
    try {
      const result = await action.run(quote ? quote.cost : null);
      setState(null);
      if (quote) announcePrepCoinChange();
      action.onSuccess?.(result);
    } catch (error) {
      const data = error?.response?.data || {};
      const shown = quote || { label: 'Prep Coins', cost: data.required ?? data.cost ?? 0, price: data.required ?? data.cost ?? 0, balance: data.balance ?? 0, freeLeft: 0, freePerMonth: 0 };
      if (data.code === 'INSUFFICIENT_PREP_COINS') setState({ action, quote: { ...shown, cost: data.required, balance: data.balance }, busy: false, shortfall: { required: data.required, balance: data.balance } });
      else if (data.code === 'PREP_COIN_PRICE_CHANGED') setState({ action, quote: { ...shown, cost: data.cost, balance: data.balance ?? shown.balance }, busy: false, error: 'The price changed. Check it and confirm again.' });
      else { setState(null); action.onError?.(error); }
    }
  }, []);

  const checkout = useCallback(async (run, { alreadyStarted = false, onSuccess, onError, onCancel } = {}) => {
    const action = { run, onSuccess, onError, onCancel };
    if (alreadyStarted) return attempt(action, null);
    let quote = null;
    try {
      const { features = [] } = await api.walletPricing();
      quote = features.find((feature) => feature.featureKey === featureKey) || null;
    } catch {
      quote = null;
    }
    // Free, or prices unavailable: the server still enforces any price, so nothing is given away.
    if (!quote?.price) return attempt(action, null);
    setState({ action, quote, busy: false });
    return undefined;
  }, [attempt, featureKey]);

  // Dismissing the dialog (Cancel, Close or the backdrop) runs nothing and tells the caller.
  const cancel = () => {
    if (!state || state.busy) return;
    setState(null);
    state.action.onCancel?.();
  };
  const dialog = state && !(state.busy && !state.quote) && state.quote
    ? <CostDialog state={state} onCancel={cancel} onConfirm={() => attempt(state.action, state.quote)} />
    : null;
  return { checkout, dialog, pending: Boolean(state?.busy) };
}
