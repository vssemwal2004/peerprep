import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, Building2, CheckCircle2, GraduationCap, Loader2, ReceiptText, Search, Send, UserRound } from 'lucide-react';
import { api } from '../../utils/api';
import { CardHeader, EmptyHint, Glass, Segmented, SkeletonRows } from '../../overview/ui';
import { relativeTime } from '../../overview/overviewModel';
import UniversityBadge from '../universities/UniversityBadge';
import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';
import { CoinAmount, CoinPage } from './shared';
import { buttonClass, formatCoins, inputClass } from './coinModel';

const TARGETS = [
  { value: 'university', label: 'University wallet' },
  { value: 'coordinator', label: 'PeerPrep coordinator' },
  { value: 'student', label: 'PeerPrep student' },
];
const QUICK = [100, 500, 1000, 5000];
const MAX = 1_000_000_000;

export default function IssueCoins() {
  const [params] = useSearchParams();
  const [target, setTarget] = useState(() => (['coordinator', 'student'].includes(params.get('role')) ? params.get('role') : 'university'));
  const [universities, setUniversities] = useState(null);
  const [universityId, setUniversityId] = useState(params.get('university') || '');
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState(params.get('search') || '');
  const [people, setPeople] = useState(null);
  const [personId, setPersonId] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [recent, setRecent] = useState(null);
  const requestId = useRef(null);

  const loadRecent = useCallback(() => api.coinLedger({ kind: 'issued', limit: 8 }).then((result) => setRecent(result.entries || [])).catch(() => setRecent([])), []);
  useEffect(() => {
    api.platformWallets().then((result) => setUniversities(result.universities || [])).catch((failure) => { setUniversities([]); setError(failure.message || 'Could not load universities.'); });
    loadRecent();
  }, [loadRecent]);

  const findPeople = useCallback(async (term = search) => {
    setError('');
    if (term.trim().length < 2) { setError('Type at least two characters to search.'); return; }
    setSearching(true);
    try {
      const result = await api.platformWalletRecipients(target, term.trim());
      setPeople(result.recipients || []);
      setPersonId((result.recipients || []).length === 1 ? result.recipients[0].id : '');
    } catch (failure) {
      setError(failure.message || 'Could not search PeerPrep accounts.');
    } finally { setSearching(false); }
  }, [search, target]);

  // Arriving from the Wallets page with ?role=…&search=… runs that search once.
  const autoSearched = useRef(false);
  useEffect(() => {
    if (autoSearched.current || target === 'university' || !params.get('search')) return;
    autoSearched.current = true;
    findPeople(params.get('search'));
  }, [findPeople, params, target]);

  const switchTarget = (value) => {
    setTarget(value); setPeople(null); setPersonId(''); setError(''); setDone(null); requestId.current = null;
  };

  const selected = useMemo(() => {
    if (target === 'university') {
      const item = universities?.find((row) => row.universityId === universityId);
      return item ? { name: item.name, balance: item.coinBalance || 0 } : null;
    }
    const person = people?.find((row) => row.id === personId);
    return person ? { name: person.name, balance: person.balance || 0 } : null;
  }, [target, universities, universityId, people, personId]);
  const count = Number(amount);
  const validAmount = Number.isSafeInteger(count) && count >= 1 && count <= MAX;
  const visibleUniversities = (universities || []).filter((item) => `${item.name} ${item.universityId}`.toLowerCase().includes(filter.trim().toLowerCase()));

  async function issue(event) {
    event.preventDefault();
    setError('');
    if (!selected || !validAmount) { setError(`Choose who receives the coins and a whole number from 1 to ${formatCoins(MAX)}.`); return; }
    setBusy(true);
    try {
      requestId.current ||= crypto.randomUUID();
      const result = target === 'university'
        ? await api.topUpUniversityCoins(universityId, { amount: count, requestId: requestId.current })
        : await api.creditPlatformWalletUser({ targetRole: target, targetUserId: personId, amount: count, requestId: requestId.current });
      requestId.current = null;
      setDone({ name: selected.name, amount: count, balance: result.balance });
      setAmount('');
      if (target === 'university') setUniversities((current) => current.map((item) => (item.universityId === universityId ? { ...item, coinBalance: result.balance } : item)));
      else setPeople((current) => current.map((person) => (person.id === personId ? { ...person, balance: result.balance } : person)));
      loadRecent();
    } catch (failure) {
      setError(failure.message || 'Could not issue coins. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <CoinPage title="Issue coins" subtitle="PeerPrep creates coins as needed: there is no Master Admin balance to run out"
      actions={<Link to="/admin/prep-coins/ledger?kind=issued" className={buttonClass.secondary}><ReceiptText className="h-4 w-4" />Issue history</Link>}>
      <div className="grid gap-4 xl:grid-cols-12">
        <Glass as="form" onSubmit={issue} className="p-5 xl:col-span-8">
          <CardHeader title="1. Who receives the coins" subtitle="Universities pass their wallet on to coordinators and students" Icon={Send}
            action={<Segmented label="Recipient type" value={target} onChange={switchTarget} options={TARGETS} />} />

          {target === 'university' ? (
            <div>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input className={`${inputClass} pl-9`} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter universities by name or ID" aria-label="Filter universities" />
              </label>
              {!universities ? <div className="mt-3"><SkeletonRows rows={3} /></div> : visibleUniversities.length ? (
                <div role="radiogroup" aria-label="University" className="mt-3 grid max-h-[300px] gap-2 overflow-y-auto pr-1 [scrollbar-width:thin] sm:grid-cols-2">
                  {visibleUniversities.map((item) => {
                    const active = item.universityId === universityId;
                    return (
                      <button key={item.universityId} type="button" role="radio" aria-checked={active} onClick={() => { setUniversityId(item.universityId); setDone(null); requestId.current = null; }}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${active ? 'border-sky-400 bg-sky-50 ring-2 ring-sky-500/20 dark:border-sky-400/50 dark:bg-sky-400/10' : 'border-slate-200 bg-white/70 hover:border-sky-200 dark:border-white/10 dark:bg-white/[0.03]'}`}>
                        <UniversityBadge university={item} size="sm" />
                        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{item.name}</span><span className="block truncate text-[11px] text-slate-500">{item.universityId}</span></span>
                        <CoinAmount value={item.coinBalance} className="text-xs text-slate-700 dark:text-slate-200" />
                      </button>
                    );
                  })}
                </div>
              ) : <div className="mt-3"><EmptyHint action={universities.length ? null : <Link to="/admin/universities/new" className="text-xs font-semibold text-sky-700">Add a university</Link>}>{universities.length ? 'No university matches.' : 'No universities yet.'}</EmptyHint></div>}
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <label className="relative block flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input className={`${inputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); findPeople(); } }}
                    placeholder={`Search ${target}s by name, email or ID`} aria-label={`Search ${target}s`} />
                </label>
                <button type="button" onClick={() => findPeople()} disabled={searching} className={buttonClass.secondary}>{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Search</button>
              </div>
              {people ? people.length ? (
                <div role="radiogroup" aria-label="Account" className="mt-3 grid max-h-[300px] gap-2 overflow-y-auto pr-1 [scrollbar-width:thin] sm:grid-cols-2">
                  {people.map((person) => {
                    const active = person.id === personId;
                    return (
                      <button key={person.id} type="button" role="radio" aria-checked={active} onClick={() => { setPersonId(person.id); setDone(null); requestId.current = null; }}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${active ? 'border-sky-400 bg-sky-50 ring-2 ring-sky-500/20 dark:border-sky-400/50 dark:bg-sky-400/10' : 'border-slate-200 bg-white/70 hover:border-sky-200 dark:border-white/10 dark:bg-white/[0.03]'}`}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900/[0.05] text-slate-500 dark:bg-white/[0.06]">{target === 'student' ? <GraduationCap className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{person.name}</span><span className="block truncate text-[11px] text-slate-500">{person.email}{person.accountId ? ` · ${person.accountId}` : ''}</span></span>
                        <CoinAmount value={person.balance} className="text-xs text-slate-700 dark:text-slate-200" />
                      </button>
                    );
                  })}
                </div>
              ) : <div className="mt-3"><EmptyHint>No active PeerPrep {target}s match.</EmptyHint></div> : <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Accounts in PeerPrep's main database. University students receive coins from their own university.</p>}
            </div>
          )}

          <div className="mt-6 border-t border-slate-100 pt-5 dark:border-white/5">
            <CardHeader title="2. How many coins" Icon={Building2} />
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative w-48">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"><PrepCoinIcon size={18} /></span>
                <input className={`${inputClass} pl-10 text-base font-semibold tabular-nums`} type="number" min="1" max={MAX} step="1" inputMode="numeric" value={amount}
                  onChange={(event) => { setAmount(event.target.value); requestId.current = null; setDone(null); }} placeholder="0" aria-label="Prep Coins to issue" />
              </label>
              {QUICK.map((value) => (
                <button key={value} type="button" onClick={() => { setAmount(String(value)); requestId.current = null; setDone(null); }}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold tabular-nums transition ${Number(amount) === value ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200' : 'border-slate-200 bg-white/70 text-slate-600 hover:border-amber-200 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300'}`}>+{formatCoins(value)}</button>
              ))}
            </div>
          </div>

          {error ? <p role="alert" className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p> : null}
          {done ? <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4 shrink-0" />{formatCoins(done.amount)} coins issued to {done.name}. New balance: {formatCoins(done.balance)}.</p> : null}
        </Glass>

        <div className="grid content-start gap-4 xl:col-span-4">
          <Glass className="p-5">
            <CardHeader title="3. Review" subtitle="Check before you issue" Icon={CheckCircle2} />
            {selected ? (
              <div className="space-y-3">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{selected.name}</p>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-slate-900/[0.03] p-3 text-center dark:bg-white/[0.04]">
                  <span><span className="block text-[11px] text-slate-500">Now</span><CoinAmount value={selected.balance} className="justify-center text-sm text-slate-900 dark:text-white" /></span>
                  <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span><span className="block text-[11px] text-slate-500">After</span><CoinAmount value={selected.balance + (validAmount ? count : 0)} className="justify-center text-sm text-emerald-700 dark:text-emerald-300" /></span>
                </div>
              </div>
            ) : <p className="text-xs text-slate-500 dark:text-slate-400">Choose a recipient and an amount.</p>}
            <button type="button" onClick={issue} disabled={busy || !selected || !validAmount} className={`${buttonClass.primary} mt-4 h-10 w-full justify-center`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{validAmount ? `Issue ${formatCoins(count)} coins` : 'Issue coins'}
            </button>
            <p className="mt-2 text-[11px] text-slate-400">Each issue is recorded in the ledger and the activity log. A retried click never issues twice.</p>
          </Glass>
          <Glass className="p-5">
            <CardHeader title="Recently issued" Icon={ReceiptText} />
            {!recent ? <SkeletonRows rows={3} /> : recent.length ? (
              <ul className="space-y-2.5">
                {recent.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0"><span className="block truncate text-xs font-medium text-slate-900 dark:text-white">{row.to}</span><span className="block truncate text-[11px] text-slate-500">{row.scope} · {relativeTime(row.createdAt)}</span></span>
                    <CoinAmount value={row.amount} sign="+" className="text-xs text-emerald-700 dark:text-emerald-300" />
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-slate-500 dark:text-slate-400">Nothing issued yet.</p>}
          </Glass>
        </div>
      </div>
    </CoinPage>
  );
}
