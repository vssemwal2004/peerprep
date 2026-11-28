// Prep Coins tab: balance, what can still be earned today, where coins came from and went, and the
// coin history. From GET /wallet (balance + movements) and /wallet/pricing (live earning amounts).
import { useMemo, useState } from "react";
import { AlertCircle, Check, Circle, Coins, GitFork, ListChecks, Loader2, ReceiptText } from "lucide-react";
import { COIN_SOURCES, coinFlow } from "../analysisModel";
import { Reveal, RevealItem } from "../components/motion";
import { CoinFlow } from "./charts";
import { ActionLink, GradientCard, GradientHeader, HeroNumber, muted, Panel, surface, Tile } from "./parts";

const dateText = (value) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function CoinsView({ wallet, today }) {
  const [shown, setShown] = useState(12);
  const data = wallet.data;
  const monthStart = useMemo(() => { const date = new Date(); return new Date(date.getFullYear(), date.getMonth(), 1).getTime(); }, []);
  const month = useMemo(() => (data ? coinFlow(data.movements, { since: monthStart }) : null), [data, monthStart]);
  const all = useMemo(() => (data ? coinFlow(data.movements) : null), [data]);
  if (wallet.loading && !data) return <div className={`${surface} flex h-72 items-center justify-center`}><Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Loading your Prep Coins" /></div>;
  if (!data) return <div className={`${surface} flex items-center gap-2 p-6 text-[13px] text-rose-700 dark:text-rose-300`}><AlertCircle className="h-4 w-4" />Your Prep Coins could not be loaded. <button type="button" onClick={() => wallet.reload()} className="font-semibold underline">Try again</button></div>;

  const earning = data.earning || {};
  const earnedToday = month?.today || new Set();
  const checklist = [
    { key: "earn_login", title: "Daily login", amount: earning.login, done: earnedToday.has("earn_login") || Boolean(today?.login), to: null },
    { key: "earn_challenge", title: "Daily challenge", amount: earning.challenge, done: earnedToday.has("earn_challenge") || Boolean(today?.challenge), to: "/problems" },
    { key: "earn_sheet", title: "Finish a Quick Prep sheet", amount: earning.sheet, done: earnedToday.has("earn_sheet"), to: "/student/quick-prep" },
  ].filter((item) => Number(item.amount) > 0);
  // Top sources and spends by name, the rest as "Other", so every label has room; both sides
  // add up to the coins in this history (kept = in − out), so the ribbons line up.
  const groupSmall = (list, keep) => (list.length <= keep ? list : [...list.slice(0, keep - 1), { label: "Other", amount: list.slice(keep - 1).reduce((sum, item) => sum + item.amount, 0) }]);
  const sources = groupSmall(all?.sources || [], 4);
  const kept = Math.max(0, (all?.earnedIn || 0) - (all?.spentOut || 0));
  const sinks = [...groupSmall(all?.spends || [], 3), { label: "Kept in your wallet", amount: kept, wallet: true }].filter((item) => item.amount > 0);
  const history = data.movements.slice(0, shown);

  return (
    <Reveal className="space-y-5" stagger={0.05}>
      <RevealItem>
        <GradientCard tone="gold" className="p-6" data-guide="an-coins-hero">
          <div className="flex flex-wrap items-end gap-6">
            <div className="min-w-0 flex-[1_1_300px]">
              <GradientHeader icon={Coins} title="Prep Coins in your wallet" subtitle="Earned by showing up and finishing things" />
              <div className="mt-4"><HeroNumber value={data.balance} className="text-[60px]" /></div>
              <p className="mt-3 max-w-xl text-[13.5px] leading-6 text-white/90">You earn coins for logins, daily challenges, finished sheets and badges (not for each solve), and spend them on paid ANVI checks.</p>
            </div>
            <div className="grid flex-[0_1_400px] grid-cols-3 gap-2.5">
              <Tile glass label="In this month">+{month?.earnedIn || 0}</Tile>
              <Tile glass label="Spent this month">{month?.spentOut || 0}</Tile>
              <Tile glass label="In, all time">{all?.earnedIn || 0}</Tile>
            </div>
          </div>
        </GradientCard>
      </RevealItem>

      <RevealItem className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel id="earn-today" guide="an-coins-today" icon={ListChecks} tone="amber" title="Earn today" insight="What still pays coins today. Amounts are the current ones set by PeerPrep.">
          {checklist.length ? (
            <ul className="space-y-2.5">
              {checklist.map((item) => (
                <li key={item.key} className="flex items-center gap-3 rounded-xl border border-[#eef0f3] bg-[#fafbfc] p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.done ? "bg-emerald-500 text-white shadow-[0_6px_14px_-8px_rgba(16,185,129,0.9)]" : "bg-gradient-to-br from-amber-300 to-orange-500 text-white shadow-[0_6px_14px_-8px_rgba(234,88,12,0.9)]"}`} aria-hidden="true">{item.done ? <Check className="h-4 w-4" strokeWidth={2.6} /> : <Coins className="h-4 w-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-slate-900 dark:text-zinc-100">{item.title}</p>
                    <p className={`text-[12px] ${item.done ? "text-emerald-700 dark:text-emerald-300" : muted}`}>{item.done ? "Earned today" : `+${item.amount} coin${item.amount === 1 ? "" : "s"}`}</p>
                  </div>
                  {!item.done && item.to ? <ActionLink to={item.to} tone="soft">Start</ActionLink> : null}
                </li>
              ))}
            </ul>
          ) : <p className={`text-[13px] ${muted}`}>Coin earning amounts could not be loaded right now.</p>}
          <p className={`mt-3 text-[12px] ${muted}`}>Badge levels and lifetime milestones pay coins too, when you reach them.</p>
        </Panel>
        <Panel id="flow" icon={GitFork} tone="violet" title="Where your coins came from and went" insight={all?.sources?.[0] ? `${all.sources[0].label} gave you the most coins.` : "No coins earned yet."}>
          <CoinFlow sources={sources} sinks={sinks} />
        </Panel>
      </RevealItem>

      <RevealItem>
        <Panel id="coin-history" icon={ReceiptText} tone="slate" title="Coin history" insight="Every coin in and out, newest first.">
          {history.length ? (
            <ul>
              {history.map((row) => {
                const out = row.direction === "out";
                return (
                  <li key={row.id} className="flex items-center gap-3 border-b border-[#eef0f3] py-2.5 last:border-0 dark:border-white/[0.06]">
                    <span className={`w-14 shrink-0 text-[13px] font-semibold tabular-nums ${out ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>{out ? "−" : "+"}{Math.abs(Number(row.amount) || 0)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-slate-900 dark:text-zinc-100">{out ? row.feature || "Spent" : COIN_SOURCES[row.kind] || row.note || "Received"}</span>
                      {row.note && row.note !== (out ? row.feature : COIN_SOURCES[row.kind]) && <span className={`block truncate text-[12px] ${muted}`}>{row.note}</span>}
                    </span>
                    <span className={`shrink-0 text-[12px] ${muted}`}>{dateText(row.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          ) : <p className={`text-[13px] ${muted}`}>No coin movements yet.</p>}
          {data.movements.length > shown && <button type="button" onClick={() => setShown((value) => value + 20)} className="mt-3 text-[13px] font-semibold text-sky-700 dark:text-sky-300">Show more</button>}
        </Panel>
      </RevealItem>
    </Reveal>
  );
}
