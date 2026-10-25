import { FileUser, Lock } from "lucide-react";
import { Alert, Card, NumberField, Segmented } from "../controls";
import { CheckList } from "./parts";
import { RESUME_SOURCES, hasResumeQuestions, readResume, toggleSource, writeResume } from "./model";

const MODES = [
  { value: "none", label: "Off" },
  { value: "optional", label: "Optional" },
  { value: "required", label: "Required" },
];
const MODE_HINTS = {
  none: "ANVI does not ask for a resume.",
  optional: "Students may share a resume. ANVI asks about it only if they do.",
  required: "Students must share a resume before they can start.",
};

export default function ResumeCard({ data, onChange, readOnly }) {
  const resume = readResume(data);
  const set = (patch) => onChange(writeResume(data, patch));
  const needsResume = resume.mode === "none" && hasResumeQuestions(data);
  return (
    <Card
      data-field="resume"
      icon={FileUser}
      title="Resume"
      description="Let ANVI ask about the student's own projects and experience."
    >
      <fieldset disabled={readOnly} className="min-w-0 space-y-6 [&>legend+*]:!mt-0">
        <legend className="sr-only">Resume</legend>
        <Segmented
          label="Ask for the student's resume"
          options={MODES}
          value={resume.mode}
          disabled={readOnly}
          hint={MODE_HINTS[resume.mode]}
          onChange={(mode) => set({ mode })}
        />
        {needsResume && (
          <Alert tone="warning">
            Your questions include resume questions. Choose Optional or Required so ANVI has a resume to ask about.
          </Alert>
        )}
        {resume.mode !== "none" && (
          <>
            <CheckList
              label="How students can share it"
              field="resumeSources"
              options={RESUME_SOURCES}
              values={resume.sources}
              isLocked={(value) => resume.sources.length === 1 && resume.sources[0] === value}
              lockedHint="At least one way must stay on."
              onToggle={(value) => set({ sources: toggleSource(resume.sources, value) })}
            />
            <div className="max-w-xs">
              <NumberField
                label="Questions from the resume"
                stepper
                min={0}
                max={5}
                value={resume.questionCount}
                hint="Asked in addition to your own questions. Up to 5."
                onChange={(questionCount) => set({ questionCount })}
              />
            </div>
          </>
        )}
        <p className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600 dark:bg-gray-800/60 dark:text-gray-300">
          <Lock size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>Only the resume text is kept, with personal details removed, and it is deleted when the interview ends.</span>
        </p>
      </fieldset>
    </Card>
  );
}
