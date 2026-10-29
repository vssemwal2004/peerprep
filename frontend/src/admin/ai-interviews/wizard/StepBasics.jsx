import { BriefcaseBusiness, GraduationCap, MessagesSquare, Target } from "lucide-react";
import { ResourcePicker } from "../Resources";
import { DIFFICULTY, EXPERIENCE, MODES } from "./steps";
import { Card, FieldLabel, Segmented, StepHeading, TextField, buttonGhost } from "./controls";

const MODE_ICONS = { guided: GraduationCap, mock: Target };

export default function StepBasics({ data, onChange, errors = {}, readOnly }) {
  const set = (patch) => onChange({ ...data, ...patch });
  return (
    <div className="space-y-6">
      <StepHeading
        title="What is this interview for?"
        description="Tell ANVI who this interview is for. These details shape the questions and how answers are judged."
      />
      <Card icon={BriefcaseBusiness} title="Role and audience" description="Who the interview is for and how hard it should be.">
        <div className="space-y-6">
          <TextField
            label="Interview name"
            field="title"
            required
            maxLength={160}
            value={data.title}
            error={errors.title}
            placeholder="e.g. Junior backend developer — practice round"
            hint="Students see this name in their AI Interviews list."
            onChange={(title) => set({ title })}
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <TextField
              label="Job role"
              field="role"
              required
              maxLength={120}
              value={data.role}
              error={errors.role}
              placeholder="e.g. Backend developer"
              onChange={(role) => set({ role })}
            />
            <div data-field="company" className="min-w-0">
              <FieldLabel optional>Company</FieldLabel>
              <ResourcePicker
                kind="companies"
                disabled={readOnly}
                selected={data.companyName}
                onSelect={(item) => set({ companyId: item._id, companyName: item.name })}
              />
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-gray-400">
                {data.companyId ? (
                  <>
                    ANVI tailors questions to this company.
                    <button
                      type="button"
                      className={`${buttonGhost} -my-1 px-1.5 py-0.5 text-xs`}
                      disabled={readOnly}
                      onClick={() => set({ companyId: "", companyName: "" })}
                    >
                      Remove company
                    </button>
                  </>
                ) : (
                  "Leave empty for general practice."
                )}
              </p>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Segmented
              label="Experience level"
              field="experience"
              required
              options={EXPERIENCE}
              value={data.experience}
              error={errors.experience}
              onChange={(experience) => set({ experience })}
            />
            <Segmented
              label="Difficulty"
              field="difficulty"
              required
              options={DIFFICULTY}
              value={data.difficulty}
              error={errors.difficulty}
              onChange={(difficulty) => set({ difficulty })}
            />
          </div>
        </div>
      </Card>
      <Card icon={MessagesSquare} title="Format" description="How ANVI runs the conversation. Interviews are in English.">
        <div className="space-y-6">
          <Segmented
            label="Interview type"
            field="mode"
            variant="cards"
            options={MODES.map((mode) => ({ ...mode, icon: MODE_ICONS[mode.value] }))}
            value={data.rules?.mode || "mock"}
            onChange={(mode) => set({ rules: { ...data.rules, mode } })}
          />
          <TextField
            label="Short description"
            field="description"
            optional
            multiline
            rows={3}
            maxLength={12000}
            value={data.description}
            placeholder="What should this interview assess? Any context about the job helps ANVI."
            onChange={(description) => set({ description })}
          />
        </div>
      </Card>
    </div>
  );
}
