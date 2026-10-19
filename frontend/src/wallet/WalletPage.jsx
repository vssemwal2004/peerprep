import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Loader2, Search, Send } from 'lucide-react';
import { api } from '../utils/api';
import PrepCoinIcon from '../components/prepCoin/PrepCoinIcon';
import { CardHeader, EmptyHint, Glass } from '../overview/ui';
import { relativeTime } from '../overview/overviewModel';
import { CoinAmount, CoinPage } from '../admin/prepCoins/shared';
import { buttonClass, formatCoins, inputClass } from '../admin/prepCoins/coinModel';

/** University admin and coordinator wallet: balance, passing coins on, and recent movements. */
export default function WalletPage() {
  const [wallet, setWallet] = useState(null);
  const [recipients, setRecipients] = useState(null);
  const [search, setSearch] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const pendingRequestId = useRef(null);

  async function refresh() { setWallet(await api.wallet()); }
  useEffect(() => { refresh().catch((error) => setMessage({ tone: 'error', text: error.message })); }, []);

  async function findRecipients(event) {
    event.preventDefault();
    setMessage(null);
    setSearching(true);
    try { setRecipients((await api.walletRecipients(search)).recipients); }
    catch (error) { setMessage({ tone: 'error', text: error.message }); }
    finally { setSearching(false); }
  }

  async function allocate(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      pendingRequestId.current ||= crypto.randomUUID();
      const count = Number(amount);
      await api.allocateWalletCoins({ targetUserId, amount: count, requestId: pendingRequestId.current });
      pendingRequestId.current = null;
      const name = recipients?.find((person) => person.id === targetUserId)?.name || 'the recipient';
      setAmount('');
      setTargetUserId('');
      await refresh();
      setMessage({ tone: 'success', text: `${formatCoins(count)} Prep Coins sent to ${name}.` });
    } catch (error) { setMessage({ tone: 'error', text: error.message || 'Could not allocate Prep Coins' }); }
    finally { setBusy(false); }
  }

  const canAllocate = wallet?.role === 'admin' || wallet?.role === 'coordinator';
  const recipientLabel = wallet?.role === 'admin' ? 'coordinator' : 'student';
  const count = Number(amount);
  const enough = wallet && Number.isSafeInteger(count) && count >= 1 && count <= Number(wallet.balance);

  return (
    <CoinPage title="Wallet" subtitle="Prep Coins are credits for student features. They never affect Prep Score or ranking">
      {message ? <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mb-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm ${message.tone === 'error' ? 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200'}`}>
        {message.tone === 'error' ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}{message.text}
      </p> : null}

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="grid content-start gap-4 xl:col-span-5">
          <Glass className="relative overflow-hidden p-6">
            <span aria-hidden="true" className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-amber-300/30 blur-3xl" />
            <div className="relative flex items-center gap-5">
              <PrepCoinIcon size={84} shine label="Prep Coin" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">Available</p>
                <p className="text-4xl font-bold tracking-tight tabular-nums text-slate-950 dark:text-white">{wallet ? formatCoins(wallet.balance) : '—'}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{wallet?.role === 'admin' ? 'Your university wallet, issued by PeerPrep' : 'Your coordinator wallet'}</p>
              </div>
            </div>
          </Glass>

          {canAllocate ? (
            <Glass as="form" onSubmit={allocate} className="p-5">
              <CardHeader title={`Send to a ${recipientLabel}`} subtitle={wallet?.role === 'admin' ? 'Coordinators pass coins on to their students' : 'Only your assigned students are listed'} Icon={Send} />
              <div className="flex gap-2">
                <label className="relative block flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input className={`${inputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') findRecipients(event); }}
                    placeholder={`Search ${recipientLabel}s by name or email`} aria-label={`Search ${recipientLabel}s`} />
                </label>
                <button type="button" onClick={findRecipients} disabled={searching} className={buttonClass.secondary}>{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Find</button>
              </div>
              {recipients ? recipients.length ? (
                <div role="radiogroup" aria-label={`Choose a ${recipientLabel}`} className="mt-3 grid max-h-[220px] gap-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
                  {recipients.map((person) => (
                    <button key={person.id} type="button" role="radio" aria-checked={targetUserId === person.id} onClick={() => { pendingRequestId.current = null; setTargetUserId(person.id); }}
                      className={`rounded-xl border px-3 py-2 text-left transition ${targetUserId === person.id ? 'border-sky-400 bg-sky-50 ring-2 ring-sky-500/20 dark:border-sky-400/50 dark:bg-sky-400/10' : 'border-slate-200 bg-white/70 hover:border-sky-200 dark:border-white/10 dark:bg-white/[0.03]'}`}>
                      <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{person.name}</span>
                      <span className="block truncate text-[11px] text-slate-500">{person.email}{person.accountId ? ` · ${person.accountId}` : ''}</span>
                    </button>
                  ))}
                </div>
              ) : <div className="mt-3"><EmptyHint>No {recipientLabel}s match.</EmptyHint></div> : null}
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="relative w-40">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"><PrepCoinIcon size={18} /></span>
                  <input className={`${inputClass} pl-10 font-semibold tabular-nums`} type="number" min="1" step="1" inputMode="numeric" value={amount} aria-label="Prep Coins to send"
                    onChange={(event) => { pendingRequestId.current = null; setAmount(event.target.value); }} placeholder="0" required />
                </label>
                <button disabled={busy || !targetUserId || !enough} className={`${buttonClass.primary} h-10`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{busy ? 'Sending…' : 'Send coins'}</button>
              </div>
              {wallet && amount && !enough ? <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">Enter a whole number up to your balance of {formatCoins(wallet.balance)}.</p> : null}
            </Glass>
          ) : null}
        </div>

        <Glass className="p-5 xl:col-span-7">
          <CardHeader title="Recent activity" subtitle="Coins received and sent" Icon={ArrowDownLeft} />
          {wallet?.movements?.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {wallet.movements.map((row) => {
                const out = row.direction === 'out';
                return (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${out ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200'}`}>
                        {out ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0"><span className="block truncate text-xs font-medium text-slate-900 dark:text-white">{out ? `Sent to ${row.toName}` : `Received from ${row.fromName}`}</span><span className="block text-[11px] text-slate-500">{relativeTime(row.createdAt)}</span></span>
                    </span>
                    <CoinAmount value={row.amount} sign={out ? '−' : '+'} className={out ? 'text-xs text-amber-700 dark:text-amber-300' : 'text-xs text-emerald-700 dark:text-emerald-300'} />
                  </li>
                );
              })}
            </ul>
          ) : <div className="flex flex-col items-center gap-2 py-10 text-center"><PrepCoinIcon size={40} /><p className="text-sm text-slate-500 dark:text-slate-400">{wallet ? 'No coin activity yet.' : 'Loading…'}</p></div>}
        </Glass>
      </div>
    </CoinPage>
  );
}
