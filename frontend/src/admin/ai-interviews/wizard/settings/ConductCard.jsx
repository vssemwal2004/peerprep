import { CircleStop, ShieldCheck } from "lucide-react";
import { Toggle } from "../../ui";
import { Card } from "../controls";
import { readConduct, writeConduct } from "./model";

export default function ConductCard({ data, onChange, readOnly }) {
  const conduct = readConduct(data);
  const set = (patch) => onChange(writeConduct(data, patch));
  return (
    <Card
      data-field="conduct"
      icon={ShieldCheck}
      title="Interview conduct"
      description="Ground rules ANVI follows in every interview."
    >
      <fieldset disabled={readOnly} className="min-w-0 space-y-6 [&>legend+*]:!mt-0">
        <legend className="sr-only">Interview conduct</legend>
        <Toggle
          label="Finish all questions"
          description="ANVI asks every question before closing, instead of wrapping up early."
          checked={conduct.finishAllQuestions}
          onChange={(finishAllQuestions) => set({ finishAllQuestions })}
          disabled={readOnly}
        />
        <Toggle
          label="Allow ending by voice"
          description={
            conduct.endByVoice
              ? "Students can end the interview by saying so, for example “I want to stop here”."
              : "If a student says they want to stop, ANVI points them to the End button."
          }
          checked={conduct.endByVoice}
          onChange={(endByVoice) => set({ endByVoice })}
          disabled={readOnly}
        />
        <Toggle
          label="No personal questions"
          description="ANVI avoids private topics such as family, religion, health or relationships."
          checked={conduct.noPersonalQuestions}
          onChange={(noPersonalQuestions) => set({ noPersonalQuestions })}
          disabled={readOnly}
        />
        <p className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600 dark:bg-gray-800/60 dark:text-gray-300">
          <CircleStop size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400 dark:text-gray-500" />
          <span>
            Students can always leave with the <strong className="font-semibold text-slate-800 dark:text-gray-100">End</strong> button.
            They see a warning first, and questions they did not reach are marked as not attempted.
          </span>
        </p>
      </fieldset>
    </Card>
  );
}
