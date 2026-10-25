import { useId } from "react";
import { FileText } from "lucide-react";
import { Toggle } from "../../ui";
import { Card, FieldLabel, inputBase } from "../controls";
import { TERMS_LIMIT, readConduct, writeConduct } from "./model";

// How the terms look in the student's lobby (a static picture, nothing here is interactive).
function TermsPreview({ text, required }) {
  return (
    <div data-terms-preview className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/50">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">Preview for students</p>
      {text.trim() ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Before you begin</p>
          <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-700 dark:bg-gray-800/70 dark:text-gray-200">
            {text}
          </div>
          {required ? (
            <p className="mt-3 flex items-center gap-2 text-[13px] text-slate-700 dark:text-gray-200">
              <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded border-2 border-slate-300 bg-white dark:border-gray-600 dark:bg-gray-950" />
              I have read and agree to these terms
            </p>
          ) : (
            <p className="mt-3 text-xs text-slate-500 dark:text-gray-400">Shown for information. Students do not need to accept.</p>
          )}
          <span
            aria-hidden="true"
            className={`mt-3 inline-flex min-h-9 items-center rounded-lg px-3.5 text-sm font-semibold text-white ${required ? "bg-sky-600/50" : "bg-sky-600"}`}
          >
            Start interview
          </span>
        </div>
      ) : (
        <p className="mt-2 text-[13px] text-slate-500 dark:text-gray-400">No terms: students go straight to the interview.</p>
      )}
    </div>
  );
}

export default function TermsCard({ data, onChange, readOnly }) {
  const conduct = readConduct(data);
  const set = (patch) => onChange(writeConduct(data, patch));
  const id = useId(),
    counterId = useId();
  const length = conduct.termsText.length;
  const hasTerms = Boolean(conduct.termsText.trim());
  return (
    <Card
      data-field="terms"
      icon={FileText}
      title="Terms & conditions"
      description="Optional rules students read before they start, such as recording or fair-use terms."
    >
      <fieldset disabled={readOnly} className="min-w-0 space-y-6 [&>legend+*]:!mt-0">
        <legend className="sr-only">Terms and conditions</legend>
        <div className="min-w-0">
          <FieldLabel htmlFor={id} optional>
            Terms students read
          </FieldLabel>
          <textarea
            id={id}
            rows={6}
            maxLength={TERMS_LIMIT}
            value={conduct.termsText}
            aria-describedby={counterId}
            placeholder="e.g. This interview is recorded as text for your report. Do not use notes or other people's help."
            onChange={(e) => set({ termsText: e.target.value })}
            className={`${inputBase} min-h-32 resize-y border-slate-300 py-2 leading-relaxed dark:border-gray-700`}
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-500 dark:text-gray-400">Plain text. Line breaks are kept.</span>
            <span
              id={counterId}
              data-terms-counter
              className={`tabular-nums ${length >= TERMS_LIMIT ? "font-semibold text-rose-600 dark:text-rose-400" : length >= TERMS_LIMIT * 0.9 ? "text-amber-700 dark:text-amber-300" : "text-slate-400 dark:text-gray-500"}`}
            >
              {length.toLocaleString("en-IN")} / {TERMS_LIMIT.toLocaleString("en-IN")} characters
            </span>
          </div>
        </div>
        <Toggle
          label="Students must accept to start"
          description={
            hasTerms
              ? "Students tick “I agree” before the interview starts. The time they accepted appears in their report."
              : "Add terms above to ask students to accept them."
          }
          checked={conduct.requireTermsAcceptance}
          onChange={(requireTermsAcceptance) => set({ requireTermsAcceptance })}
          disabled={readOnly || !hasTerms}
        />
        <TermsPreview text={conduct.termsText} required={conduct.requireTermsAcceptance} />
      </fieldset>
    </Card>
  );
}
