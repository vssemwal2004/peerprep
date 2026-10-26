import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Save, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import StudentAccessSelector from './components/StudentAccessSelector';
import { ALL_STUDENT_FEATURES } from '../student/studentFeatureAccess';

export default function StudentAccessSettings() {
  const toast = useToast();
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.getStudentAccessPolicy().then(({ policy: next }) => setPolicy(next)).catch((error) => toast.error(error.message || 'Could not load student access defaults.')).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const access = policy ? { mode: policy.defaultMode, features: policy.defaultFeatures } : null;
  const save = async () => {
    if (access.mode === 'custom' && !access.features.length) return toast.error('Enable at least one feature.');
    setSaving(true);
    try {
      const result = await api.updateStudentAccessPolicy({ defaultMode: access.mode, defaultFeatures: access.features });
      setPolicy(result.policy);
      toast.success('Default student access saved. It will apply to future students.');
    } catch (error) { toast.error(error.message || 'Could not save the access policy.'); }
    finally { setSaving(false); }
  };
  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-sky-600" /></div>;
  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-slate-200 bg-gradient-to-r from-sky-50 to-indigo-50 px-6 py-6 dark:border-gray-700 dark:from-sky-950/30 dark:to-indigo-950/20">
        <div className="flex items-start gap-4"><span className="rounded-xl bg-sky-600 p-3 text-white shadow-lg shadow-sky-200 dark:shadow-none"><ShieldCheck className="h-6 w-6" /></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">Settings · Students</p><h1 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Default student access</h1><p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-gray-300">Choose what every future student receives at onboarding. Existing student permissions stay unchanged.</p></div></div>
      </div>
      <div className="space-y-6 p-6">
        <button type="button" role="switch" aria-checked={access.mode === 'all'} onClick={() => setPolicy((current) => ({ ...current, defaultMode: current.defaultMode === 'all' ? 'custom' : 'all', defaultFeatures: current.defaultFeatures?.length ? current.defaultFeatures : [...ALL_STUDENT_FEATURES] }))} className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition ${access.mode === 'all' ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/25' : 'border-slate-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-800'}`}>
          <span className="flex items-start gap-3"><Sparkles className={`mt-0.5 h-5 w-5 ${access.mode === 'all' ? 'text-emerald-600' : 'text-slate-400'}`} /><span><span className="block text-sm font-bold text-slate-900 dark:text-white">Give complete platform access automatically</span><span className="mt-1 block text-xs text-slate-500 dark:text-gray-400">When enabled, add-student flows skip the access popup and grant every current and future module.</span></span></span>
          <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${access.mode === 'all' ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-gray-600'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${access.mode === 'all' ? 'left-6' : 'left-1'}`} /></span>
        </button>
        <StudentAccessSelector value={access} showMode={false} onChange={(next) => setPolicy((current) => ({ ...current, defaultMode: 'custom', defaultFeatures: next.features }))} />
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400"><CheckCircle2 className="h-4 w-4 text-emerald-500" />Changes affect future single and Excel/CSV onboarding only.</p><button type="button" onClick={save} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save defaults</button></div>
      </div>
    </div>
  </div>;
}
