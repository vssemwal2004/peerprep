import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { uid } from "./definition";
import {
  Dialog,
  Field,
  Notice,
  TextArea,
  TextInput,
  primaryClass,
  secondaryClass,
} from "./ui";

// Mirrors backend LIMITS.generateQuestions.
const MAX_GENERATED = 20;
const iconButtonClass =
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800";

// Generate & review: ANVI drafts questions for an ANVI-prompt topic. Nothing changes in the topic
// until the admin confirms "Use these questions", which turns it into a manual topic.
export default function GenerateReviewDialog({
  group,
  capacity,
  onGenerate,
  onUse,
  onClose,
}) {
  const annu = group.annu || {};
  const maxCount = Math.max(0, Math.min(MAX_GENERATED, capacity));
  const [count, setCount] = useState(
    Math.max(1, Math.min(annu.targetCount || 3, maxCount || 1)),
  );
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const request = (n) =>
    onGenerate({
      groupId: group.id,
      count: n,
      requirements: annu.requirements || "",
      skills: (annu.skills || []).map((s) => s.trim()).filter(Boolean),
      difficulty: group.difficulty || "",
    });
  const toItem = (q) => ({
    key: uid(),
    prompt: q.prompt || "",
    expectedAnswer: q.expectedAnswer || "",
  });
  const generateAll = async () => {
    if (
      items.length &&
      !window.confirm("Replace these questions with a new set from ANVI?")
    )
      return;
    setBusy("all");
    setError("");
    setConfirming(false);
    try {
      const result = await request(count);
      if (!mounted.current) return;
      setItems((result?.questions || []).map(toItem));
      if (!result?.questions?.length)
        setError("ANVI did not return any questions. Try again.");
    } catch (err) {
      if (mounted.current) setError(err.message || "Generation failed.");
    } finally {
      if (mounted.current) setBusy(null);
    }
  };
  const regenerate = async (key) => {
    setBusy(key);
    setError("");
    try {
      const result = await request(1);
      if (!mounted.current) return;
      const next = result?.questions?.[0];
      const taken = new Set(
        items
          .filter((item) => item.key !== key)
          .map((item) => item.prompt.trim().toLowerCase()),
      );
      if (!next || taken.has(next.prompt.trim().toLowerCase()))
        setError("ANVI suggested a question you already have. Try again.");
      else
        setItems((previous) =>
          previous.map((item) =>
            item.key === key ? { ...toItem(next), key } : item,
          ),
        );
    } catch (err) {
      if (mounted.current) setError(err.message || "Generation failed.");
    } finally {
      if (mounted.current) setBusy(null);
    }
  };
  const update = (key, patch) =>
    setItems((previous) =>
      previous.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  const empty = items.some((item) => !item.prompt.trim());
  const overCapacity = items.length > capacity;
  const canUse = items.length > 0 && !empty && !overCapacity && !busy;
  const countValid = Number.isInteger(count) && count >= 1 && count <= maxCount;
  return (
    <Dialog title="Generate now & review" wide onClose={onClose}>
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-lg bg-indigo-50/70 px-3 py-2 text-xs leading-relaxed text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
          <Sparkles size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          ANVI drafts questions from this topic’s instructions. Edit or remove
          any of them; every student then gets the same questions. Nothing
          changes until you choose Use these questions.
        </p>
        {maxCount < 1 ? (
          <Notice error>
            This interview has no room for more main questions. Remove
            questions elsewhere before generating.
          </Notice>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <Field
              label="Number of questions"
              hint={`1–${maxCount}`}
              className="w-40"
            >
              <TextInput
                type="number"
                min={1}
                max={maxCount}
                step={1}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </Field>
            <button
              type="button"
              data-generate-all
              className={`${items.length ? secondaryClass : primaryClass} mb-5`}
              disabled={Boolean(busy) || !countValid || !annu.requirements?.trim()}
              onClick={generateAll}
            >
              {busy === "all" ? (
                <Loader2
                  size={14}
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : items.length ? (
                <RefreshCw size={14} aria-hidden="true" />
              ) : (
                <Sparkles size={14} aria-hidden="true" />
              )}
              {items.length ? "Regenerate all" : "Generate questions"}
            </button>
          </div>
        )}
        {!annu.requirements?.trim() && (
          <Notice>Describe what ANVI should ask before generating.</Notice>
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {busy
            ? "ANVI is writing questions."
            : items.length
              ? `${items.length} questions ready to review.`
              : ""}
        </p>
        {error && <Notice error>{error}</Notice>}
        {busy === "all" && !items.length && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-indigo-200 px-4 py-6 text-sm text-slate-600 dark:border-indigo-900 dark:text-gray-300">
            <Loader2
              size={16}
              aria-hidden="true"
              className="animate-spin text-indigo-500 motion-reduce:animate-none"
            />
            ANVI is writing questions…
          </div>
        )}
        {items.length > 0 && (
          <ol
            aria-label="Generated questions"
            className="max-h-[50dvh] space-y-3 overflow-y-auto pr-1"
          >
            {items.map((item, index) => (
              <li
                key={item.key}
                data-generated-question
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-gray-400">
                    Question {index + 1}
                  </h3>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={iconButtonClass}
                      disabled={Boolean(busy)}
                      aria-label={`Regenerate question ${index + 1}`}
                      onClick={() => regenerate(item.key)}
                    >
                      {busy === item.key ? (
                        <Loader2
                          size={13}
                          aria-hidden="true"
                          className="animate-spin motion-reduce:animate-none"
                        />
                      ) : (
                        <RefreshCw size={13} aria-hidden="true" />
                      )}
                      Regenerate
                    </button>
                    <button
                      type="button"
                      className={`${iconButtonClass} hover:text-rose-600`}
                      disabled={Boolean(busy)}
                      aria-label={`Remove question ${index + 1}`}
                      onClick={() =>
                        setItems((previous) =>
                          previous.filter((x) => x.key !== item.key),
                        )
                      }
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                </div>
                <TextArea
                  aria-label={`Question ${index + 1} text`}
                  rows={2}
                  className="min-h-16"
                  maxLength={12000}
                  value={item.prompt}
                  onChange={(e) => update(item.key, { prompt: e.target.value })}
                />
                <Field
                  label="Expected answer (admin only)"
                  hint="Key points, one per line. Used to evaluate answers."
                >
                  <TextArea
                    aria-label={`Question ${index + 1} expected answer`}
                    rows={3}
                    maxLength={12000}
                    value={item.expectedAnswer}
                    onChange={(e) =>
                      update(item.key, { expectedAnswer: e.target.value })
                    }
                  />
                </Field>
              </li>
            ))}
          </ol>
        )}
        {empty && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Write or remove any empty question.
          </p>
        )}
        {overCapacity && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            The interview has room for {capacity} more main questions. Remove{" "}
            {items.length - capacity}.
          </p>
        )}
        {confirming ? (
          <div
            role="alertdialog"
            aria-label="Confirm replacing ANVI instructions"
            className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <p>
              Use these {items.length} questions for this topic? This replaces
              the topic’s ANVI instructions, so students get these exact
              questions instead of new ones. The topic name and settings stay
              unchanged.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={secondaryClass}
                onClick={() => setConfirming(false)}
              >
                Back to review
              </button>
              <button
                type="button"
                autoFocus
                className={primaryClass}
                disabled={!canUse}
                onClick={() => onUse(items)}
              >
                Replace with these questions
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-gray-800">
            <button type="button" className={secondaryClass} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={primaryClass}
              disabled={!canUse}
              onClick={() => setConfirming(true)}
            >
              Use these questions
              {items.length ? ` (${items.length})` : ""}
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
