import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Check, Plus, Save, Sparkles, Trash2, Trophy } from 'lucide-react';
import { api } from '../utils/api';
import { isUniversityDeployment } from '../platform/universityPermissions';
import BadgeEmblem from '../student/profile/BadgeEmblem';

const access = { coding: 'questions', learning: 'learning', assessments: 'assessments', interviews: 'interviews', events: 'events' };
const labels = { coding: 'Coding questions', learning: 'Learning', assessments: 'Assessments', interviews: 'AI interviews', events: 'Peer interviews' };
const field = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';
const panel = 'rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#242424]';
// Only the daily challenge is assigned now; weekly/monthly settings are kept in stored policies but not edited.
const numericFields = [['dailyMinutes', 'Daily time budget (minutes)', 10, 45], ['dailyXp', 'Daily challenge XP', 0, 100]];

export default function EngagementSettings() {
  const [college, setCollege] = useState('');
  const [selectedCollege, setSelectedCollege] = useState('');
  const [cohort, setCohort] = useState('all');
  const [data, setData] = useState(null), [settings, setSettings] = useState(null), [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [saving, setSaving] = useState(false);
  const [custom, setCustom] = useState({ title: '', metric: 'activeDays', target: 10 });
  const requestId = useRef(0);
  const query = `?${new URLSearchParams({ ...(selectedCollege ? { college: selectedCollege } : {}), ...(cohort !== 'all' ? { semester: cohort.split(':')[1] } : {}) })}`;
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setError(''); setData(null); setSettings(null); setAnalytics(null);
    try {
      const result = await api.getEngagementPolicy(query);
      if (id !== requestId.current) return;
      setData(result); setSettings(result.settings);
      const stats = await api.getEngagementAnalytics(query);
      if (id === requestId.current) setAnalytics(stats);
    } catch (cause) { if (id === requestId.current) setError(cause.message || 'Settings could not be loaded.'); }
  }, [query]);
  useEffect(() => { void load(); return () => { requestId.current += 1; }; }, [load]);
  const change = (key, value) => { setSettings((current) => ({ ...current, [key]: value })); setNotice(''); };
  const save = async (event) => {
    const id = requestId.current;
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    const payload = { ...settings, customBadges: (settings.customBadges || []).map((b) => ({ ...b, id: b.id.replace(/^university-/, '') })) };
    try {
      const result = await api.updateEngagementPolicy({ cohort, settings: payload }, query);
      if (id !== requestId.current) return;
      setSettings(result.settings); setNotice('Policy saved. New assignments use these rules; existing targets and earned rewards are preserved.');
    } catch (cause) { if (id === requestId.current) setError(cause.message || 'Policy could not be saved.'); }
    finally { setSaving(false); }
  };
  const addBadge = () => {
    if (!custom.title.trim() || !Number.isInteger(custom.target) || custom.target < 1) return;
    const category = data.badges.find((b) => b.metric === custom.metric)?.category || 'growth';
    change('customBadges', [...(settings.customBadges || []), { ...custom, title: custom.title.trim(), id: `campus-${Date.now().toString(36)}`, category, rarity: 'Special', description: `Reach ${custom.target} ${custom.metric}.`, minimumLevel: 1 }]);
    setCustom({ title: '', metric: 'activeDays', target: 10 });
  };
  return <div className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-[#1a1a1a] dark:text-zinc-100 sm:p-6">
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex items-start gap-3"><span className="rounded-xl bg-sky-100 p-3 text-sky-600 dark:bg-sky-500/10"><Sparkles size={23} /></span><div><h1 className="text-xl font-semibold">Student progression</h1><p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">A personal daily coding problem for every student, 50 permanent badges and levels. Build curated quests under Quests.</p></div></header>
      <div className={`${panel} flex flex-wrap items-end gap-4`}>
        {!isUniversityDeployment && <div><label className="text-xs font-medium">University name<input value={college} onChange={(event) => setCollege(event.target.value)} placeholder="Default deployment" className={field} /></label><button type="button" onClick={() => setSelectedCollege(college.trim())} className="mt-2 text-xs font-semibold text-sky-600">Load university</button></div>}
        <label className="text-xs font-medium">Policy scope<select className={field} value={cohort} onChange={(event) => { setNotice(''); setCohort(event.target.value); }}><option value="all">All students</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={`semester:${i + 1}`}>Semester {i + 1}</option>)}</select></label>
        <p className="max-w-xl text-xs leading-relaxed text-slate-500">University allocations are the upper limit. Selecting a feature here cannot grant access to a module your university does not have. Semester policies inherit university defaults.</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-900/10 dark:text-rose-300">{error} {!data && <button className="underline" onClick={load}>Retry</button>}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><Check size={15} className="mr-2 inline" />{notice}</p>}
      {!settings && !error ? <div className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-zinc-800" /> : settings && <form onSubmit={save} className="space-y-5">
        <section className={panel}><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Daily challenge policy</h2><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.enabled} onChange={(event) => change('enabled', event.target.checked)} />Enabled</label></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{Object.entries(labels).map(([domain, label]) => { const permitted = data.permissions[access[domain]] === true; return <label key={domain} className={`rounded-lg border p-3 text-xs ${permitted ? 'border-slate-200 dark:border-zinc-700' : 'border-dashed border-slate-200 text-slate-400 dark:border-zinc-800'}`}><span className="flex items-center gap-2"><input type="checkbox" disabled={!permitted} checked={permitted && settings.domains.includes(domain)} onChange={(event) => change('domains', event.target.checked ? [...settings.domains, domain] : settings.domains.filter((d) => d !== domain))} />{label}</span>{!permitted && <span className="mt-1 block">Not allocated</span>}</label>; })}</div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{numericFields.map(([key, label, min, max]) => <label key={key} className="text-xs font-medium">{label}<input className={field} type="number" min={min} max={max} required value={settings[key]} onChange={(event) => change(key, Number(event.target.value))} /></label>)}
            <label className="text-xs font-medium">Difficulty ceiling<select className={field} value={settings.maxDifficulty} onChange={(event) => change('maxDifficulty', event.target.value)}>{['Easy', 'Medium', 'Hard'].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="text-xs font-medium">Pause through (IST)<input type="date" className={field} value={settings.pauseUntil ? settings.pauseUntil.slice(0, 10) : ''} onChange={(event) => change('pauseUntil', event.target.value ? `${event.target.value}T23:59:59+05:30` : null)} /></label>
          </div><p className="mt-3 text-xs text-slate-500">Daily reset: 2 AM IST. Each student gets one unsolved coding problem at their level, different from classmates. Universities without coding get one task from their other features.</p>
        </section>
        <section className={panel}><h2 className="flex items-center gap-2 font-semibold"><Trophy size={17} className="text-amber-500" />University badges</h2><p className="mt-1 text-xs text-slate-500">Build badges from verified metrics. Earned editions keep their original requirements.</p>
          <div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_100px_auto]"><label className="text-xs">Badge name<input className={field} maxLength={60} value={custom.title} onChange={(event) => setCustom((c) => ({ ...c, title: event.target.value }))} /></label><label className="text-xs">Verified metric<select className={field} value={custom.metric} onChange={(event) => setCustom((c) => ({ ...c, metric: event.target.value }))}>{[...new Set(data.badges.filter((b) => !access[b.category] || data.permissions[access[b.category]]).map((b) => b.metric))].map((metric) => <option key={metric}>{metric}</option>)}</select></label><label className="text-xs">Target<input className={field} type="number" min={1} max={10000} value={custom.target} onChange={(event) => setCustom((c) => ({ ...c, target: Number(event.target.value) }))} /></label><button type="button" disabled={(settings.customBadges || []).length >= 12} onClick={addBadge} className="rounded-lg bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"><Plus size={15} className="mr-1 inline" />Add</button></div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(settings.customBadges || []).map((badge) => <li key={badge.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-zinc-700"><BadgeEmblem badge={{ ...badge, earned: true }} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{badge.title}</p><p className="text-xs text-slate-500">{badge.target} {badge.metric}</p></div><button type="button" aria-label={`Retire ${badge.title}`} onClick={() => change('customBadges', settings.customBadges.filter((b) => b.id !== badge.id))} className="text-slate-400 hover:text-rose-600"><Trash2 size={15} /></button></li>)}</ul>
        </section>
        <div className="flex items-center justify-end"><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"><Save size={16} />{saving ? 'Saving…' : 'Save progression policy'}</button></div>
      </form>}
      {data && <section className={panel}><h2 className="flex items-center gap-2 font-semibold"><BookOpen size={17} className="text-sky-500" />Level requirements</h2><p className="mt-1 text-xs text-slate-500">All three conditions are required. XP cannot substitute for mastery. Levels never drop when a student takes a break.</p><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr>{['Level', 'Name', 'XP', 'Mastery', 'Active days'].map((label) => <th key={label} className="px-2 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{data.levels.map((level) => <tr key={level.level} className="border-t border-slate-100 dark:border-zinc-800"><td className="px-2 py-2">{level.level}</td><td className="px-2 py-2 font-semibold">{level.title}</td><td className="px-2 py-2">{level.xp}</td><td className="px-2 py-2">{level.mastery}%</td><td className="px-2 py-2">{level.days}</td></tr>)}</tbody></table></div></section>}
      {analytics && <section className={panel}><h2 className="font-semibold">Last 30 days</h2><p className="mt-1 text-xs text-slate-500">{analytics.activeStudents} students earned rewards · {analytics.xp} XP awarded</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{['daily'].map((kind) => { const row = analytics.missions.find((m) => m._id === kind); return <div key={kind} className="rounded-lg bg-slate-50 p-3 dark:bg-zinc-900/50"><p className="text-xs capitalize text-slate-500">{kind} completion</p><p className="mt-1 text-xl font-semibold">{row?.assigned ? Math.round(row.completed / row.assigned * 100) : 0}%</p><p className="text-xs text-slate-400">{row?.completed || 0} / {row?.assigned || 0} plans</p></div>; })}</div></section>}
    </div>
  </div>;
}
