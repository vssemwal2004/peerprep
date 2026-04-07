import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

export const topicOptions = [
  "Arrays",
  "Strings",
  "Hashing",
  "Sorting",
  "Two Pointers",
  "Binary Search",
  "Stacks",
  "Queues",
  "Linked List",
  "Trees",
  "Graphs",
  "Greedy",
  "DP",
  "Backtracking",
];

export const createEmptyBenchmark = () => ({
  companyName: "",
  dsaAccuracyRequired: 70,
  requiredTopics: [],
  minQuestionAttempts: 0,
  minStreak: 5,
  interviewScore: 70,
  weightDsa: 0.4,
  weightConsistency: 0.3,
  weightInterview: 0.3,
});

export const validateBenchmark = (values) => {
  const errors = {};
  if (!values.companyName?.trim()) errors.companyName = "Company name is required.";
  if (!values.requiredTopics || values.requiredTopics.length === 0) errors.requiredTopics = "Select at least one topic.";
  if (values.dsaAccuracyRequired < 0 || values.dsaAccuracyRequired > 100) errors.dsaAccuracyRequired = "Must be between 0 and 100.";
  if (values.minQuestionAttempts < 0) errors.minQuestionAttempts = "Must be 0 or greater.";
  if (values.minStreak < 0) errors.minStreak = "Must be 0 or greater.";
  if (values.interviewScore < 0 || values.interviewScore > 100) errors.interviewScore = "Must be between 0 and 100.";
  if (values.weightDsa < 0 || values.weightDsa > 1) errors.weightDsa = "Must be between 0 and 1.";
  if (values.weightConsistency < 0 || values.weightConsistency > 1) errors.weightConsistency = "Must be between 0 and 1.";
  if (values.weightInterview < 0 || values.weightInterview > 1) errors.weightInterview = "Must be between 0 and 1.";
  return errors;
};

export default function CompanyBenchmarkForm({ values, setValues, errors = {} }) {
  const [topicInput, setTopicInput] = useState("");

  const weightSum = useMemo(
    () => Number(values.weightDsa) + Number(values.weightConsistency) + Number(values.weightInterview),
    [values.weightDsa, values.weightConsistency, values.weightInterview]
  );

  const weightWarning = weightSum < 0.95 || weightSum > 1.05;

  const toggleTopic = (topic) => {
    setValues((prev) => {
      const exists = prev.requiredTopics.includes(topic);
      return {
        ...prev,
        requiredTopics: exists ? prev.requiredTopics.filter((t) => t !== topic) : [...prev.requiredTopics, topic],
      };
    });
  };

  const addCustomTopic = () => {
    const cleaned = topicInput.trim();
    if (!cleaned) return;
    setValues((prev) => ({
      ...prev,
      requiredTopics: prev.requiredTopics.includes(cleaned)
        ? prev.requiredTopics
        : [...prev.requiredTopics, cleaned],
    }));
    setTopicInput("");
  };

  return (
    <div className="grid gap-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-400">Basic Info</div>
        <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-gray-300">
          Company Name
          <input
            value={values.companyName}
            onChange={(e) => setValues((prev) => ({ ...prev, companyName: e.target.value }))}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            placeholder="Example Corp"
          />
          {errors.companyName && <p className="mt-1 text-xs text-rose-500">{errors.companyName}</p>}
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-400">DSA Requirements</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-gray-300">
            Minimum Accuracy (%)
            <input
              type="number"
              min="0"
              max="100"
              value={values.dsaAccuracyRequired}
              onChange={(e) => setValues((prev) => ({ ...prev, dsaAccuracyRequired: Number(e.target.value) }))}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            {errors.dsaAccuracyRequired && <p className="mt-1 text-xs text-rose-500">{errors.dsaAccuracyRequired}</p>}
          </label>
          <label className="text-xs font-semibold text-slate-600 dark:text-gray-300">
            Minimum Question Attempts
            <input
              type="number"
              min="0"
              value={values.minQuestionAttempts}
              onChange={(e) => setValues((prev) => ({ ...prev, minQuestionAttempts: Number(e.target.value) }))}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            {errors.minQuestionAttempts && <p className="mt-1 text-xs text-rose-500">{errors.minQuestionAttempts}</p>}
          </label>
        </div>
        <div className="mt-5">
          <div className="text-xs font-semibold text-slate-600 dark:text-gray-300">Required Topics</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {topicOptions.map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => toggleTopic(topic)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  values.requiredTopics.includes(topic)
                    ? "bg-sky-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                {topic}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomTopic();
                }
              }}
              placeholder="Add custom topic"
              className="w-full flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            <button
              type="button"
              onClick={addCustomTopic}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Plus className="h-4 w-4" />
              Add Topic
            </button>
          </div>
          {errors.requiredTopics && <p className="mt-2 text-xs text-rose-500">{errors.requiredTopics}</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-400">Consistency</div>
        <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-gray-300">
          Minimum Streak Days
          <input
            type="number"
            min="0"
            value={values.minStreak}
            onChange={(e) => setValues((prev) => ({ ...prev, minStreak: Number(e.target.value) }))}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          {errors.minStreak && <p className="mt-1 text-xs text-rose-500">{errors.minStreak}</p>}
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-400">Interview</div>
        <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-gray-300">
          Minimum Interview Score
          <input
            type="number"
            min="0"
            max="100"
            value={values.interviewScore}
            onChange={(e) => setValues((prev) => ({ ...prev, interviewScore: Number(e.target.value) }))}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          {errors.interviewScore && <p className="mt-1 text-xs text-rose-500">{errors.interviewScore}</p>}
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-400">Weight Configuration</div>
          <div className={`text-xs font-semibold ${weightWarning ? "text-amber-500" : "text-emerald-500"}`}>
            Total: {weightSum.toFixed(2)}
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-xs font-semibold text-slate-600 dark:text-gray-300">
            DSA Weight
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={values.weightDsa}
              onChange={(e) => setValues((prev) => ({ ...prev, weightDsa: Number(e.target.value) }))}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            {errors.weightDsa && <p className="mt-1 text-xs text-rose-500">{errors.weightDsa}</p>}
          </label>
          <label className="text-xs font-semibold text-slate-600 dark:text-gray-300">
            Consistency Weight
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={values.weightConsistency}
              onChange={(e) => setValues((prev) => ({ ...prev, weightConsistency: Number(e.target.value) }))}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            {errors.weightConsistency && <p className="mt-1 text-xs text-rose-500">{errors.weightConsistency}</p>}
          </label>
          <label className="text-xs font-semibold text-slate-600 dark:text-gray-300">
            Interview Weight
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={values.weightInterview}
              onChange={(e) => setValues((prev) => ({ ...prev, weightInterview: Number(e.target.value) }))}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            {errors.weightInterview && <p className="mt-1 text-xs text-rose-500">{errors.weightInterview}</p>}
          </label>
        </div>
        {weightWarning && (
          <p className="mt-3 text-xs text-amber-500">
            Weights should sum to approximately 1.00. You can still save, but review the balance.
          </p>
        )}
      </div>
    </div>
  );
}
