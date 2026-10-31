import { useRef } from "react";
import { BriefcaseBusiness, FileText } from "lucide-react";
import { interviewApi } from "../api";
import { DIFFICULTY, EXPERIENCE } from "./steps";
import { Card, Segmented, StepHeading, TextField } from "./controls";
import { ComboField } from "./ComboField";
import { JOB_NAMES, JOB_ROLES } from "./jobCatalog";

const keyOf = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
const namesOf = (result) => (result?.items || []).map((item) => item.name);
const CUSTOM_LIMIT = 100;

// PeerPrep's company catalog changes rarely, so one load serves the whole session (a failure retries next time).
let catalogLoad = null;
const companyCatalog = () => {
  catalogLoad ||= Promise.resolve()
    .then(() => interviewApi.companyCatalog())
    .then((result) => result?.companies || [])
    .catch(() => {
      catalogLoad = null;
      return [];
    });
  return catalogLoad;
};

// Defaults first in their curated order, then names this university's admins added.
const jobOptions = (kind, defaults) => async (search) => {
  const custom = await interviewApi
    .resources(kind, { active: "true", search, limit: CUSTOM_LIMIT })
    .then(namesOf)
    .catch(() => []);
  return [...defaults, ...custom];
};
const companyOptions = async (search) => {
  const [own, catalog] = await Promise.all([
    interviewApi.resources("companies", { active: "true", search, limit: CUSTOM_LIMIT }).then(namesOf).catch(() => []),
    companyCatalog(),
  ]);
  return [...own, ...catalog];
};

export default function StepBasics({ data, onChange, errors = {}, readOnly }) {
  // Saving a new name is async; merge into the latest draft so edits made meanwhile are kept.
  const latest = useRef(data);
  latest.current = data;
  const set = (patch) => onChange({ ...latest.current, ...patch });
  const pickJob = (kind, key) => async (name, { isNew }) => {
    const saved = isNew ? (await interviewApi.saveResource(kind, { name }))?.name || name : name;
    set({ [key]: saved });
  };
  // An interview references a company by id: picking a catalog name creates (or reuses) the admin's own entry.
  const pickCompany = async (name) => {
    if (!name) return set({ companyId: "", companyName: "" });
    if (keyOf(name) === keyOf(latest.current.companyName) && latest.current.companyId) return undefined;
    const company = await interviewApi.saveResource("companies", { name });
    return set({ companyId: company._id, companyName: company.name });
  };

  return (
    <div className="space-y-6">
      <StepHeading
        title="What is this interview for?"
        description="Tell ANVI who this interview is for. These details shape the questions and how answers are judged."
      />
      <Card icon={BriefcaseBusiness} title="Role and audience" description="Who the interview is for and how hard it should be.">
        <fieldset disabled={readOnly} className="min-w-0 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <ComboField
              label="Interview name"
              field="title"
              required
              value={data.title}
              error={errors.title}
              placeholder="Search or add, e.g. Backend Developer"
              hint="Students see this name in their AI Interviews list."
              loadOptions={jobOptions("jobNames", JOB_NAMES)}
              onSelect={pickJob("jobNames", "title")}
              disabled={readOnly}
            />
            <ComboField
              label="Job role"
              field="role"
              required
              value={data.role}
              error={errors.role}
              placeholder="Search or add, e.g. Node.js Developer"
              loadOptions={jobOptions("jobRoles", JOB_ROLES)}
              onSelect={pickJob("jobRoles", "role")}
              disabled={readOnly}
            />
          </div>
          <ComboField
            label="Company"
            field="company"
            required
            value={data.companyName}
            error={errors.company}
            placeholder="Search or add a company"
            hint="ANVI tailors questions to this company."
            loadOptions={companyOptions}
            onSelect={pickCompany}
            disabled={readOnly}
          />
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
        </fieldset>
      </Card>
      <Card icon={FileText} title="Description" description="Context about the job helps ANVI ask the right questions.">
        <TextField
          label="Short description"
          field="description"
          optional
          multiline
          rows={3}
          maxLength={12000}
          value={data.description}
          disabled={readOnly}
          placeholder="What should this interview assess? Any context about the job helps ANVI."
          onChange={(description) => set({ description })}
        />
      </Card>
    </div>
  );
}
