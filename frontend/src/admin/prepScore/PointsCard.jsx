import { Coins, MinusCircle, PlusCircle } from 'lucide-react';
import { card, helperText, inputClass, NumberField, sectionTitle, Toggle } from './fields';
import GuideInfo from '../../guide/platform/GuideInfo';

/**
 * Prep Score v6 points (backend services/prepScore/points.js): what adds points, what removes them.
 * The score is replayed from each student's own history, so a published change applies to all.
 */
export default function PointsCard({ config, update }) {
  const points = config.points;
  if (!points) return null;
  const at = (path) => (value) => update(['points', ...path], value);
  return (
    <section data-guide="psa-points" className={card} aria-labelledby="points-title">
      <div className="flex items-center gap-2"><Coins className="h-5 w-5 text-sky-600" aria-hidden="true" /><h2 id="points-title" className={sectionTitle}>Prep Score points</h2><GuideInfo step="psa-points" /></div>
      <p className={`mt-1 ${helperText}`}>Students earn activity points from these rules, replayed from their own history; Prep Score follows them on the growth curve below. It never goes below 0, and a solve never lowers it.</p>

      <h3 className="mt-5 flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-300"><PlusCircle className="h-4 w-4" />Adds points</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <NumberField label="Easy solve" value={points.solve.Easy} min={0} max={1000} onChange={at(['solve', 'Easy'])} helper="First accepted solve" />
        <NumberField label="Medium solve" value={points.solve.Medium} min={0} max={1000} onChange={at(['solve', 'Medium'])} helper="Shared across its topics" />
        <NumberField label="Hard solve" value={points.solve.Hard} min={0} max={1000} onChange={at(['solve', 'Hard'])} helper="Easy ≤ Medium ≤ Hard" />
        <NumberField label="Daily challenge" value={points.dailyChallenge} min={0} max={1000} onChange={at(['dailyChallenge'])} helper="Once per day" />
        <NumberField label="Sheet completed" value={points.sheetCompleted} min={0} max={1000} onChange={at(['sheetCompleted'])} helper="Once per Quick Prep sheet" />
        <NumberField label="Daily login" value={points.login} min={0} max={100} onChange={at(['login'])} helper="First visit of the day" />
        <NumberField label="Monthly badge level" value={points.monthlyBadgeLevel} min={0} max={1000} onChange={at(['monthlyBadgeLevel'])} helper="Each level reached" />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Lifetime badges by tier</p>
      <div className="mt-2 grid grid-cols-5 gap-2 sm:max-w-xl">
        {['Bronze', 'Silver', 'Gold', 'Platinum', 'Legend'].map((tier, index) => (
          <label key={tier} className="text-center text-[11px] text-slate-500 dark:text-slate-400">{tier}
            <input aria-label={`Lifetime badge ${tier} points`} type="number" min={0} max={1000} className={`${inputClass} mt-1 px-1 text-center font-semibold`}
              value={Number.isFinite(points.lifetimeBadge[index]) ? points.lifetimeBadge[index] : ''}
              onChange={(event) => update(['points', 'lifetimeBadge'], points.lifetimeBadge.map((value, at2) => (at2 === index ? (event.target.value === '' ? Number.NaN : Number(event.target.value)) : value)))} />
          </label>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Topic limit applies from
          <input type="date" className={`${inputClass} mt-1`} value={points.topicLimitFrom} onChange={(event) => update(['points', 'topicLimitFrom'], event.target.value)} />
          <span className={`mt-1 block font-normal ${helperText}`}>Solves before this day count in full. The daily limit per topic is set in Prep Coding below (T).</span>
        </label>
      </div>

      <h3 className="mt-6 flex items-center gap-1.5 text-sm font-bold text-rose-700 dark:text-rose-300"><MinusCircle className="h-4 w-4" />Removes points (small, capped)</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <NumberField label="Wrong answer" value={points.wrongSubmission} min={0} max={100} step={0.1} onChange={at(['wrongSubmission'])} helper="WA, TLE, runtime error; never compile errors" />
        <NumberField label="Wrong answers, max a day" value={points.wrongDailyCap} min={0} max={1000} onChange={at(['wrongDailyCap'])} helper="Daily cap" />
        <NumberField label="Inactivity grace days" value={points.inactivity.graceDays} min={0} max={60} step={1} onChange={at(['inactivity', 'graceDays'])} helper="Days without a submission that cost nothing" />
        <NumberField label="Inactivity per day" value={points.inactivity.perDay} min={0} max={100} step={0.5} onChange={at(['inactivity', 'perDay'])} helper="After the grace days" />
        <NumberField label="Inactivity, max a month" value={points.inactivity.monthlyCap} min={0} max={1000} onChange={at(['inactivity', 'monthlyCap'])} helper="Monthly cap" />
      </div>
      <div className="mt-4 flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
        <Toggle checked={points.refundSameDay !== false} onChange={(value) => update(['points', 'refundSameDay'], value)} label="Give back wrong-answer points when solved the same day" />
        <span>Give back wrong-answer points when the problem is solved the same day</span>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <NumberField label="Protected share of solve points" value={points.lossFloorShare} min={0} max={1} step={0.05} onChange={at(['lossFloorShare'])} helper="0.75 = losses take at most 25% of what solving earned" />
      </div>

      <h3 className="mt-6 text-sm font-bold text-slate-800 dark:text-slate-100">Growth curve</h3>
      <p className={`mt-1 ${helperText}`}>Prep Score = scale × (activity points)<sup>exponent</sup>. An exponent below 1 makes the score grow quickly at first and more slowly later, like the earlier formula. Exponent 1 = plain points.</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <NumberField label="Curve scale" value={points.curve?.scale} min={0.01} max={1000} step={0.05} onChange={at(['curve', 'scale'])} helper="Multiplies the score" />
        <NumberField label="Curve exponent" value={points.curve?.exponent} min={0.1} max={1} step={0.05} onChange={at(['curve', 'exponent'])} helper="0.4 = the earlier formula's shape" />
      </div>
      <CurvePreview points={points} />
    </section>
  );
}

/** What typical students would score with these values (Medium-heavy mix, no losses). */
function CurvePreview({ points }) {
  const { scale = 1, exponent = 1 } = points.curve || {};
  const avg = 0.3 * points.solve.Easy + 0.5 * points.solve.Medium + 0.2 * points.solve.Hard;
  const score = (activity) => Math.round(scale * Math.max(0, activity) ** exponent * 100) / 100;
  const rows = [1, 7, 30, 100, 300, 500, 1000].map((solves) => {
    const activity = solves * avg;
    return { solves, score: score(activity), next: Math.round((score(activity + points.solve.Medium) - score(activity)) * 100) / 100 };
  });
  return (
    <table className="mt-4 w-full max-w-xl text-left text-sm" data-no-serial>
      <caption className={`text-left ${helperText}`}>Preview: problems solved (30% Easy, 50% Medium, 20% Hard), the score, and what one more Medium solve adds</caption>
      <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-1.5 pr-3">Solved</th><th className="py-1.5 pr-3">Prep Score</th><th className="py-1.5">Next Medium adds</th></tr></thead>
      <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
        {rows.map((row) => <tr key={row.solves}><td className="py-1.5 pr-3">{row.solves}</td><td className="py-1.5 pr-3 font-semibold text-slate-900 dark:text-white">{row.score}</td><td className="py-1.5 text-emerald-700 dark:text-emerald-300">+{row.next}</td></tr>)}
      </tbody>
    </table>
  );
}
