import { useId } from "react";
import { focus } from "./list/styles";

export const CONSENT_TEXT = "My spoken answers are processed by Google Gemini to run this interview; audio is not saved.";

/** The processing consent every join needs. */
export function ConsentBox({ checked, onChange, disabled = false }) {
  const id = useId();
  return <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 text-sm transition hover:border-violet-300 has-[:checked]:border-violet-400 has-[:checked]:bg-violet-50/60 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-violet-500/40 dark:has-[:checked]:border-violet-500/50 dark:has-[:checked]:bg-violet-500/[0.07]">
    <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-800" />
    <span className="text-slate-700 dark:text-zinc-200">{CONSENT_TEXT}</span>
  </label>;
}

/** ANVI interviews are English only, whatever an older interview's language setting says. */
export const INTERVIEW_LANGUAGE = "English";

/** The interview terms in a scrollable box, with "I agree" when the institution requires acceptance. */
export function TermsStep({ terms, accepted, onAccept, disabled = false }) {
  const id = useId();
  return <div>
    {terms.text && <div tabIndex={0} role="region" aria-label="Interview terms"
      className={`max-h-44 overflow-y-auto whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3 text-[13px] leading-6 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 ${focus}`}>{terms.text}</div>}
    {terms.required ? <label htmlFor={`${id}-agree`} className={`${terms.text ? "mt-3" : ""} flex cursor-pointer items-start gap-2.5 text-sm text-slate-700 dark:text-zinc-200`}>
      <input id={`${id}-agree`} type="checkbox" checked={accepted} disabled={disabled} onChange={(event) => onAccept(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-800" />
      <span>{terms.text ? "I have read and agree to these terms." : "I agree to the interview terms set by my institution."}</span>
    </label>
      : <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">For your information. No action needed.</p>}
  </div>;
}
