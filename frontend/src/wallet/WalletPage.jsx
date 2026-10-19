import { useEffect, useRef, useState } from 'react';
import { Wallet } from 'lucide-react';
import { api } from '../utils/api';

export default function WalletPage() {
  const [wallet, setWallet] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [search, setSearch] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pendingRequestId = useRef(null);

  async function refresh() { setWallet(await api.wallet()); }
  useEffect(() => { refresh().catch((error) => setMessage(error.message)); }, []);

  async function findRecipients(event) {
    event.preventDefault();
    setMessage('');
    try { setRecipients((await api.walletRecipients(search)).recipients); }
    catch (error) { setMessage(error.message); }
  }

  async function allocate(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      pendingRequestId.current ||= crypto.randomUUID();
      await api.allocateWalletCoins({ targetUserId, amount: Number(amount), requestId: pendingRequestId.current });
      pendingRequestId.current = null;
      setAmount('');
      setTargetUserId('');
      await refresh();
      setMessage('Prep Coins allocated successfully.');
    } catch (error) { setMessage(error.message || 'Could not allocate Prep Coins'); }
    finally { setBusy(false); }
  }

  const canAllocate = wallet?.role === 'admin' || wallet?.role === 'coordinator';
  const recipientLabel = wallet?.role === 'admin' ? 'coordinator' : 'student';
  return <main className="mx-auto max-w-4xl space-y-6 p-5 text-slate-900 dark:text-white sm:p-8">
    <header className="flex items-center gap-3"><Wallet className="h-8 w-8 text-sky-600" /><div><h1 className="text-2xl font-bold">Prep Coin management</h1><p className="text-sm text-slate-500">Balances and allocations, independent from Prep Score</p></div></header>
    {message && <p role="status" className="rounded-xl bg-sky-50 p-3 text-sm dark:bg-sky-950">{message}</p>}
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm text-slate-500">Available Prep Coins</p>
      <p className="mt-1 text-4xl font-bold tabular-nums">{wallet ? Number(wallet.balance).toLocaleString() : '—'}</p>
      <p className="mt-2 text-xs text-slate-500">Prep Coins can be allocated or viewed. They never affect Prep Score or ranking.</p>
    </section>
    {canAllocate && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-lg font-semibold">Allocate to a {recipientLabel}</h2>
      <form onSubmit={findRecipients} className="mt-4 flex flex-wrap gap-2"><input className="min-w-52 flex-1 rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${recipientLabel} by name or email`} /><button className="rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white">Find</button></form>
      <form onSubmit={allocate} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid min-w-52 flex-1 gap-1 text-sm">Recipient<select className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" value={targetUserId} onChange={(event) => { pendingRequestId.current = null; setTargetUserId(event.target.value); }} required><option value="">Select a {recipientLabel}</option>{recipients.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Prep Coins<input className="w-36 rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" type="number" min="1" step="1" value={amount} onChange={(event) => { pendingRequestId.current = null; setAmount(event.target.value); }} required /></label>
        <button disabled={busy || !targetUserId} className="rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Allocating…' : 'Allocate coins'}</button>
      </form>
    </section>}
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"><h2 className="text-lg font-semibold">Recent activity</h2>{wallet?.movements?.length ? <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">{wallet.movements.map((row) => <li key={row.id} className="flex justify-between gap-3 py-3 text-sm"><span>{row.fromName} → {row.toName}<span className="block text-xs text-slate-500">{new Date(row.createdAt).toLocaleString()}</span></span><strong className="tabular-nums">{Number(row.amount).toLocaleString()}</strong></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No coin activity yet.</p>}</section>
  </main>;
}
