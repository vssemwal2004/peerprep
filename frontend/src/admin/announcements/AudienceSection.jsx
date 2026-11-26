import { useState } from 'react';
import { Globe2, Loader2, UserCheck, Users } from 'lucide-react';
import AudienceDialog from './AudienceDialog';

const SAMPLE = 6;

/**
 * "Who sees this": all students, or only chosen students (picked from the registered list or an
 * uploaded CSV/Excel). form: { audience, students, hiddenCount, audienceLoaded, audienceError }.
 */
export default function AudienceSection({ form, setForm, className = '' }) {
  const [open, setOpen] = useState(false);
  const selected = form.audience === 'selected';
  const count = form.students.length + (form.hiddenCount || 0);
  const setAudience = (audience) => {
    setForm((current) => ({ ...current, audience }));
    if (audience === 'selected' && form.audienceLoaded && !form.students.length && !form.hiddenCount) setOpen(true);
  };
  const options = [
    { key: 'all', title: 'All students', hint: 'Every registered student sees it.', Icon: Globe2 },
    { key: 'selected', title: 'Selected students', hint: 'Only the students you choose or upload.', Icon: UserCheck },
  ];

  return (
    <section className={className} data-guide="ac-audience" aria-labelledby="ann-audience">
      <h2 id="ann-audience" className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Users className="h-4 w-4 text-sky-600" />Who sees this</h2>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Who sees this">
        {options.map(({ key, title, hint, Icon }) => {
          const active = form.audience === key;
          return (
            <button key={key} type="button" role="radio" aria-checked={active} onClick={() => setAudience(key)}
              className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition ${active ? 'border-sky-500 bg-sky-50/60 ring-2 ring-sky-500/25 dark:bg-sky-500/10' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.04]'}`}>
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${active ? 'border-sky-600' : 'border-slate-300 dark:border-gray-600'}`}>{active ? <span className="h-2 w-2 rounded-full bg-sky-600" /> : null}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-900 dark:text-white"><Icon className="h-4 w-4 text-sky-600" />{title}</span>
                <span className="block text-[12px] text-slate-500 dark:text-slate-400">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60">
          {!form.audienceLoaded ? (
            form.audienceError
              ? <p role="alert" className="text-[12.5px] text-rose-600">{form.audienceError} The chosen students stay as they are unless you choose again.</p>
              : <p className="flex items-center gap-2 text-[12.5px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading the chosen students…</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white">
                  {count ? <><span className="tabular-nums">{count.toLocaleString()}</span> student{count === 1 ? '' : 's'} will see this</> : 'No students chosen yet'}
                </p>
                {form.students.length ? (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {form.students.slice(0, SAMPLE).map((student) => <span key={student._id} className="max-w-[180px] truncate rounded-md bg-white px-2 py-0.5 text-[11.5px] text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-gray-900 dark:text-slate-200 dark:ring-gray-700">{student.name || student.email}</span>)}
                    {form.students.length > SAMPLE ? <span className="px-1 py-0.5 text-[11.5px] text-slate-500">+{(form.students.length - SAMPLE).toLocaleString()} more</span> : null}
                  </p>
                ) : <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">Choose from registered students or upload a CSV/Excel list (name and email).</p>}
                {form.hiddenCount ? <p className="mt-1 text-[11.5px] text-slate-500 dark:text-slate-400">Includes {form.hiddenCount.toLocaleString()} chosen by someone with wider access.</p> : null}
              </div>
              <button type="button" onClick={() => setOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 text-[13px] font-semibold text-white hover:bg-sky-700">
                <UserCheck className="h-4 w-4" />{count ? 'Change students' : 'Choose students'}
              </button>
            </div>
          )}
        </div>
      ) : null}

      <AudienceDialog open={open} students={form.students} hiddenCount={form.hiddenCount || 0} onClose={() => setOpen(false)}
        onDone={(students) => { setForm((current) => ({ ...current, audience: 'selected', students, audienceLoaded: true, audienceError: '' })); setOpen(false); }} />
    </section>
  );
}
