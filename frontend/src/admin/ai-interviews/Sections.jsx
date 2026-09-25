import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import {
  ROOT,
  categories,
  equalWeights,
  newGroup,
  newSection,
  rekeySection,
  uid,
} from "./definition";
import { GroupEditor, TimingFields } from "./Editors";
import {
  Badge,
  EmptyState,
  Field,
  Panel,
  Select,
  TextArea,
  TextInput,
  primaryClass,
  secondaryClass,
} from "./ui";

export default function Sections({
  interviewId,
  data,
  onChange,
  sectionId,
  groupId,
  limits,
}) {
  const base = `${ROOT}/${interviewId}/sections`,
    section = data.sections.find((s) => s.id === sectionId),
    group = section?.groups.find((g) => g.id === groupId);
  const setSections = (sections) => onChange({ ...data, sections });
  const update = (next) =>
    setSections(data.sections.map((s) => (s.id === next.id ? next : s)));
  const reorder = (items, index, delta) => {
    const next = [...items];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    return next;
  };
  if (sectionId && !section)
    return (
      <EmptyState
        title="Section not found"
        detail="It may have been removed from this draft."
        action={
          <Link to={base} className={secondaryClass}>
            Back to sections
          </Link>
        }
      />
    );
  if (groupId && !group)
    return (
      <EmptyState
        title="Question group not found"
        detail="Return to the section to select another group."
        action={
          <Link to={`${base}/${sectionId}`} className={secondaryClass}>
            Back to section
          </Link>
        }
      />
    );
  if (group)
    return (
      <GroupEditor
        key={group.id}
        group={group}
        limits={limits}
        onChange={(next) =>
          update({
            ...section,
            groups: section.groups.map((g) => (g.id === next.id ? next : g)),
          })
        }
      />
    );
  if (section)
    return (
      <div className="space-y-4">
        <Panel title="Section details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Section name">
              <TextInput
                maxLength={120}
                value={section.name}
                onChange={(e) => update({ ...section, name: e.target.value })}
              />
            </Field>
            <Field label="Category">
              <Select
                options={categories}
                value={section.category}
                onChange={(e) =>
                  update({ ...section, category: e.target.value })
                }
              />
            </Field>
            <Field label="Candidate instructions" className="sm:col-span-2">
              <TextArea
                value={section.instructions}
                maxLength={12000}
                onChange={(e) =>
                  update({ ...section, instructions: e.target.value })
                }
              />
            </Field>
          </div>
        </Panel>
        <Panel
          title="Question groups"
          action={
            <button
              type="button"
              disabled={section.groups.length >= limits.groups}
              className={primaryClass}
              onClick={() =>
                update({
                  ...section,
                  groups: equalWeights([...section.groups, newGroup()]),
                })
              }
            >
              <Plus size={14} />
              Add group
            </button>
          }
        >
          {section.groups.length ? (
            <div className="space-y-2">
              {section.groups.map((g, index) => (
                <div
                  key={g.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 dark:border-gray-700"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      className="text-sm font-semibold text-sky-700"
                      to={`${base}/${section.id}/groups/${g.id}`}
                    >
                      {g.name || "Untitled group"}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {g.source === "manual"
                        ? `${g.questions.length} manual questions`
                        : `${g.annu.targetCount} planned · ANNU`}
                    </p>
                  </div>
                  <Field label="Weight %">
                    <TextInput
                      className="!w-20"
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={g.weight}
                      onChange={(e) =>
                        update({
                          ...section,
                          groups: section.groups.map((x) =>
                            x.id === g.id
                              ? { ...x, weight: Number(e.target.value) }
                              : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <button
                    className={secondaryClass}
                    disabled={index === 0}
                    aria-label={`Move ${g.name} up`}
                    onClick={() =>
                      update({
                        ...section,
                        groups: reorder(section.groups, index, -1),
                      })
                    }
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className={secondaryClass}
                    disabled={index === section.groups.length - 1}
                    aria-label={`Move ${g.name} down`}
                    onClick={() =>
                      update({
                        ...section,
                        groups: reorder(section.groups, index, 1),
                      })
                    }
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    className={secondaryClass}
                    aria-label={`Duplicate ${g.name}`}
                    disabled={section.groups.length >= limits.groups}
                    onClick={() => {
                      const cloned = rekeySection({
                        id: uid(),
                        name: "",
                        groups: [g],
                      }).groups[0];
                      cloned.name = `${g.name} (copy)`;
                      update({
                        ...section,
                        groups: equalWeights([...section.groups, cloned]),
                      });
                    }}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    className={secondaryClass}
                    aria-label={`Delete ${g.name}`}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Remove this group and all its questions?",
                        )
                      )
                        update({
                          ...section,
                          groups: equalWeights(
                            section.groups.filter((x) => x.id !== g.id),
                          ),
                        });
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div className="flex justify-between pt-2 text-xs text-slate-500">
                <span>
                  Total:{" "}
                  {section.groups.reduce((n, g) => n + g.weight, 0).toFixed(2)}%
                </span>
                <button
                  className="text-sky-700"
                  onClick={() =>
                    update({ ...section, groups: equalWeights(section.groups) })
                  }
                >
                  Use equal weights
                </button>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Add a question group"
              detail="Groups can use manual questions or an ANNU specification."
            />
          )}
        </Panel>
        <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <summary className="cursor-pointer text-sm font-medium">
            Section timing overrides
          </summary>
          <div className="mt-4">
            <TimingFields
              overrides
              value={section.ruleOverrides}
              onChange={(value) => update({ ...section, ruleOverrides: value })}
            />
          </div>
        </details>
      </div>
    );
  return (
    <Panel
      title="Sections"
      action={
        <button
          disabled={data.sections.length >= limits.sections}
          className={primaryClass}
          onClick={() =>
            setSections(equalWeights([...data.sections, newSection()]))
          }
        >
          <Plus size={14} />
          Add section
        </button>
      }
    >
      {!data.sections.length ? (
        <EmptyState
          title="Build the interview structure"
          detail="Start with a technical, behavioral or custom section."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {categories.slice(0, 3).map((c) => (
                <button
                  key={c}
                  className={secondaryClass}
                  onClick={() => setSections([newSection(c)])}
                >
                  <Plus size={14} />
                  {c}
                </button>
              ))}
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          {data.sections.map((s, index) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-4 dark:border-gray-700"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sm font-semibold text-sky-700">
                {index + 1}
              </span>
              <div className="min-w-40 flex-1">
                <Link
                  className="font-semibold text-slate-900 hover:text-sky-700 dark:text-white"
                  to={`${base}/${s.id}`}
                >
                  {s.name || "Untitled section"}
                </Link>
                <div className="mt-1 flex gap-2 text-xs text-slate-500">
                  <Badge>{s.category}</Badge>
                  <span>{s.groups.length} groups</span>
                </div>
              </div>
              <Field label="Weight %">
                <TextInput
                  className="!w-20"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={s.weight}
                  onChange={(e) =>
                    update({ ...s, weight: Number(e.target.value) })
                  }
                />
              </Field>
              <div className="flex gap-1">
                <button
                  className={secondaryClass}
                  disabled={index === 0}
                  aria-label={`Move ${s.name} up`}
                  onClick={() => setSections(reorder(data.sections, index, -1))}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className={secondaryClass}
                  disabled={index === data.sections.length - 1}
                  aria-label={`Move ${s.name} down`}
                  onClick={() => setSections(reorder(data.sections, index, 1))}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  className={secondaryClass}
                  disabled={data.sections.length >= limits.sections}
                  aria-label={`Duplicate ${s.name}`}
                  onClick={() =>
                    setSections(
                      equalWeights([...data.sections, rekeySection(s)]),
                    )
                  }
                >
                  <Copy size={14} />
                </button>
                <button
                  className={secondaryClass}
                  aria-label={`Delete ${s.name}`}
                  onClick={() => {
                    if (
                      window.confirm("Remove this section and all its groups?")
                    )
                      setSections(
                        equalWeights(
                          data.sections.filter((x) => x.id !== s.id),
                        ),
                      );
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          <div className="flex justify-between pt-2 text-xs text-slate-500">
            <span>
              Total section weight:{" "}
              {data.sections.reduce((n, s) => n + s.weight, 0).toFixed(2)}%
            </span>
            <button
              className="font-medium text-sky-700"
              onClick={() => setSections(equalWeights(data.sections))}
            >
              Use equal weights
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Adding, duplicating or removing items resets their sibling weights
            equally. Set custom weights after arranging your sections.
          </p>
        </div>
      )}
    </Panel>
  );
}
