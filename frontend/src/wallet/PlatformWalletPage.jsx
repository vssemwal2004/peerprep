import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { api } from '../utils/api';

const formatCoins = (value) => Number(value || 0).toLocaleString();

function PeerPrepAccountCredits({ onCredited }) {
  const [role, setRole] = useState('coordinator');
  const [search, setSearch] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [searched, setSearched] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pendingRequestId = useRef(null);

  function resetRecipients() {
    pendingRequestId.current = null;
    setRecipients([]);
    setSearched(false);
    setTargetUserId('');
  }

  async function findRecipients(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    if (search.trim().length < 2) {
      setError('Enter at least two characters to search.');
      return;
    }
    setSearching(true);
    try {
      const result = await api.platformWalletRecipients(role, search.trim());
      setRecipients(result.recipients || []);
      setSearched(true);
      setTargetUserId('');
    } catch (requestError) {
      setError(requestError.message || 'Could not search PeerPrep accounts.');
    } finally {
      setSearching(false);
    }
  }

  async function credit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    const count = Number(amount);
    if (!targetUserId || !Number.isSafeInteger(count) || count < 1 || count > 1_000_000_000) {
      setError('Select an account and enter a whole number from 1 to 1,000,000,000.');
      return;
    }
    setBusy(true);
    try {
      pendingRequestId.current ||= crypto.randomUUID();
      const result = await api.creditPlatformWalletUser({ targetRole: role, targetUserId, amount: count, requestId: pendingRequestId.current });
      pendingRequestId.current = null;
      setAmount('');
      const recipient = recipients.find((person) => person.id === targetUserId);
      setRecipients((current) => current.map((person) => person.id === targetUserId
        ? { ...person, balance: result.balance } : person));
      setMessage(`${formatCoins(count)} coins added to ${recipient?.name || 'the selected account'}. Current balance: ${formatCoins(result.balance)}.`);
      try { await onCredited(); }
      catch { setError('Coins were added, but activity could not refresh. Reload the page to see the latest activity.'); }
    } catch (requestError) {
      setError(requestError.message || 'Could not add coins. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const selected = recipients.find((person) => person.id === targetUserId);

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
    <h2 className="text-lg font-semibold">Add coins to PeerPrep accounts</h2>
    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a coordinator or student from PeerPrep's main database. University accounts receive coins through their university wallet.</p>
    {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{message}</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
    <form onSubmit={findRecipients} className="mt-5 flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">Account type
        <select className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" value={role} onChange={(event) => { setRole(event.target.value); resetRecipients(); }}>
          <option value="coordinator">Coordinator</option>
          <option value="student">Student</option>
        </select>
      </label>
      <label className="grid min-w-56 flex-1 gap-1 text-sm">Find by name, email, or ID
        <input className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" value={search} onChange={(event) => { setSearch(event.target.value); resetRecipients(); }} placeholder="Search PeerPrep accounts" />
      </label>
      <button className="rounded-lg border border-sky-300 px-5 py-2 font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-950" disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
    </form>
    {searched && !recipients.length && <p className="mt-3 text-sm text-slate-500">No active PeerPrep {role}s found.</p>}
    {recipients.length > 0 && <form onSubmit={credit} className="mt-5 flex flex-wrap items-end gap-3">
      <label className="grid min-w-56 flex-1 gap-1 text-sm">Recipient
        <select className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" value={targetUserId} onChange={(event) => { pendingRequestId.current = null; setTargetUserId(event.target.value); }} required>
          <option value="">Select {role}</option>
          {recipients.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.email} {person.accountId ? `· ${person.accountId}` : ''}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">Coins
        <input className="w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" type="number" min="1" max="1000000000" step="1" value={amount} onChange={(event) => { pendingRequestId.current = null; setAmount(event.target.value); }} required />
      </label>
      <button className="rounded-lg bg-sky-600 px-5 py-2 font-semibold text-white hover:bg-sky-700 disabled:opacity-50" disabled={busy || !targetUserId}>{busy ? 'Adding…' : 'Add coins'}</button>
    </form>}
    {selected && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Current account balance: <strong className="text-slate-900 dark:text-white">{formatCoins(selected.balance)} coins</strong></p>}
  </section>;
}

export default function PlatformWalletPage() {
  const [universities, setUniversities] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [universityId, setUniversityId] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pendingRequestId = useRef(null);

  async function refresh() {
    const result = await api.platformWallets();
    setUniversities(result.universities || []);
    setActivity(result.movements || []);
  }

  useEffect(() => {
    refresh().catch((requestError) => setError(requestError.message || 'Could not load university wallets'))
      .finally(() => setLoading(false));
  }, []);

  async function addCoins(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    const count = Number(amount);
    if (!universityId || !Number.isSafeInteger(count) || count < 1 || count > 1_000_000_000) {
      setError('Select a university and enter a whole number from 1 to 1,000,000,000.');
      return;
    }
    setBusy(true);
    try {
      pendingRequestId.current ||= crypto.randomUUID();
      const result = await api.topUpUniversityCoins(universityId, { amount: count, requestId: pendingRequestId.current });
      pendingRequestId.current = null;
      setAmount('');
      setUniversities((current) => current.map((item) => item.universityId === universityId
        ? { ...item, coinBalance: result.balance } : item));
      setMessage(`${formatCoins(count)} coins added to ${universities.find((item) => item.universityId === universityId)?.name || universityId}.`);
      try { await refresh(); }
      catch { setError('Coins were added, but the wallet list could not refresh. Reload the page to see the latest balances.'); }
    } catch (requestError) {
      setError(requestError.message || 'Could not add coins. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const filtered = universities.filter((item) => `${item.name} ${item.universityId}`.toLowerCase().includes(search.toLowerCase().trim()));
  const selected = universities.find((item) => item.universityId === universityId);

  return <main className="mx-auto max-w-5xl space-y-6 p-5 text-slate-900 dark:text-white sm:p-8">
    <header className="flex items-start gap-3">
      <Wallet className="mt-1 h-8 w-8 shrink-0 text-sky-600" />
      <div>
        <h1 className="text-2xl font-bold">PeerPrep wallet</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Issue coins to university wallets or PeerPrep's own coordinators and students.</p>
      </div>
    </header>

    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{message}</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <h2 className="text-lg font-semibold">Add coins to a university</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">PeerPrep issues coins as needed; there is no fixed superadmin balance.</p>
      <form onSubmit={addCoins} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="grid min-w-56 flex-1 gap-1 text-sm">University
          <select className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" value={universityId} onChange={(event) => { pendingRequestId.current = null; setUniversityId(event.target.value); }} required>
            <option value="">Select university</option>
            {universities.map((item) => <option key={item.universityId} value={item.universityId}>{item.name} ({item.universityId})</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Coins
          <input className="w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" type="number" min="1" max="1000000000" step="1" value={amount} onChange={(event) => { pendingRequestId.current = null; setAmount(event.target.value); }} required />
        </label>
        <button className="rounded-lg bg-sky-600 px-5 py-2 font-semibold text-white hover:bg-sky-700 disabled:opacity-50" disabled={busy || loading || !universities.length}>{busy ? 'Adding…' : 'Add coins'}</button>
      </form>
      {selected && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Current university wallet balance: <strong className="text-slate-900 dark:text-white">{formatCoins(selected.coinBalance)} coins</strong></p>}
    </section>

    <PeerPrepAccountCredits onCredited={refresh} />

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">University wallets</h2><p className="text-sm text-slate-500 dark:text-slate-400">Balances available for university admins to allocate</p></div>
        <input aria-label="Search university wallets" className="min-w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" placeholder="Search universities" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {loading ? <p className="mt-5 text-sm text-slate-500">Loading wallets…</p> : filtered.length ? <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-700">
        {filtered.map((item) => <li key={item.universityId} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div><p className="font-semibold">{item.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{item.universityId}</p></div>
          <div className="flex items-center gap-4"><span className="text-right"><strong className="block tabular-nums">{formatCoins(item.coinBalance)}</strong><span className="text-xs text-slate-500">coins available</span></span><button type="button" className="rounded-lg border border-sky-300 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-950" onClick={() => { pendingRequestId.current = null; setUniversityId(item.universityId); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Add coins</button></div>
        </li>)}
      </ul> : <p className="mt-5 text-sm text-slate-500">{universities.length ? 'No universities match your search.' : <>No universities yet. <Link className="font-semibold text-sky-600 underline" to="/admin/platform">Create a university</Link> to start.</>}</p>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <h2 className="text-lg font-semibold">Recent PeerPrep account activity</h2>
      {activity.length ? <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-700">{activity.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span>{row.fromName} → {row.toName}<span className="block text-xs text-slate-500">{new Date(row.createdAt).toLocaleString()}</span></span><strong className="tabular-nums">{formatCoins(row.amount)} coins</strong></li>)}</ul>
        : <p className="mt-3 text-sm text-slate-500">No PeerPrep account coin activity yet.</p>}
    </section>
  </main>;
}
