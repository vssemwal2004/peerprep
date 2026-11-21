import { Link } from "react-router-dom";
import { ArrowRight, Compass, LayoutGrid } from "lucide-react";
import { DIFFICULTY_COLORS } from "../insightCharts";
import { formatNumber, formatPercent, sectionPath, visibleSections } from "../insightModel";
import { SECTION_ICONS } from "../sectionIcons";
import SummaryHero from "../components/SummaryHero";
import CoachPanel from "../components/CoachPanel";
import { BadgesCard } from "../components/BadgesViews";
import { HeatmapCard, LastActiveList, RecordsCard } from "../components/ExtraCards";
import { Reveal, RevealItem } from "../components/motion";
import { focusRing, ProgressBar, Section } from "../components/ui";
import GuideInfo from "../../../guide/platform/GuideInfo";

const ACCENTS = {
  topics: "from-sky-500 to-cyan-400", coding: "from-blue-600 to-sky-400", quickprep: "from-amber-500 to-orange-400", learning: "from-teal-500 to-emerald-400",
  tests: "from-rose-500 to-pink-400", interviews: "from-violet-500 to-fuchsia-400", activity: "from-cyan-500 to-sky-400", badges: "from-amber-400 to-yellow-300", companies: "from-slate-600 to-slate-400",
  "prep-readiness": "from-violet-600 to-purple-400",
};

/** What each feature card says in brief: a big number, a caption and an optional bar. */
function summaryOf(id, insights, badges) {
  const { sections, coverage, activity } = insights;
  switch (id) {
    case "topics": return { value: `${coverage.preparation.states.strong}/${coverage.preparation.coreTopics}`, caption: "core topics strong", bar: coverage.preparation.percent };
    case "coding": return { value: formatNumber(sections.coding.solved.total), caption: `accepted · ${formatPercent(sections.coding.accuracy)} accuracy`, levels: sections.coding.solved };
    case "quickprep": return { value: `${Math.round(sections.quickprep.progress)}%`, caption: `${sections.quickprep.finished} of ${sections.quickprep.available} sheets finished`, bar: sections.quickprep.progress };
    case "learning": return { value: formatPercent(sections.learning.progress), caption: `${sections.learning.completedTopics} of ${sections.learning.availableTopics} lessons`, bar: sections.learning.progress };
    case "tests": return { value: sections.assessment.taken ? formatPercent(sections.assessment.averageScore) : "—", caption: `average · ${sections.assessment.passed} passed · ${sections.assessment.upcoming.length} coming up`, bar: sections.assessment.taken ? sections.assessment.averageScore : null };
    case "interviews": {
      const { mock, ai } = sections.interview;
      return { value: formatNumber((mock?.done || 0) + (ai?.completed || 0)), caption: [mock && `${mock.done} mock`, ai && `${ai.completed} AI`].filter(Boolean).join(" · ") + " this period" };
    }
    case "activity": return { value: formatNumber(activity.streak.current), caption: `day streak · best ${activity.streak.best}` };
    case "badges": return badges.data ? { value: `${badges.data.earned.length}/${badges.data.total}`, caption: badges.data.level ? `badges · Level ${badges.data.level.level}` : "badges earned", bar: (badges.data.earned.length / Math.max(1, badges.data.total)) * 100 } : { value: "—", caption: "badges" };
    case "companies": return { value: "Compare", caption: "your readiness with a company's bar" };
    case "prep-readiness": return { value: "SBC · PBC", caption: "coding practice targets 70 and 75" };
    default: return { value: "", caption: "" };
  }
}

function FeatureCard({ section, insights, badges }) {
  const Icon = SECTION_ICONS[section.id];
  const summary = summaryOf(section.id, insights, badges);
  return (
    <Link to={sectionPath(section.id)} className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#e9eaee] bg-white p-4 transition duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-[0_22px_44px_-26px_rgba(15,23,42,0.45)] dark:border-white/[0.07] dark:bg-[#232325] ${focusRing}`}>
      <span className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${ACCENTS[section.id]} opacity-70 transition-all duration-300 group-hover:h-1.5 group-hover:opacity-100`} aria-hidden="true" />
      <span className={`pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br ${ACCENTS[section.id]} opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-25`} aria-hidden="true" />
      <div className="relative flex items-center justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${ACCENTS[section.id]} text-white shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-6deg]`} aria-hidden="true"><Icon className="h-5 w-5" /></span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition duration-300 group-hover:bg-sky-600 group-hover:text-white dark:bg-white/[0.06]" aria-hidden="true"><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
      </div>
      <p className="relative mt-4 text-[13px] font-semibold text-slate-500 dark:text-zinc-400">{section.label}</p>
      <p className="relative text-[26px] font-semibold leading-tight tracking-[-0.03em] text-slate-950 tabular-nums dark:text-zinc-50">{summary.value}</p>
      <p className="relative mt-0.5 line-clamp-2 text-[12px] text-slate-500 dark:text-zinc-400">{summary.caption}</p>
      <div className="relative mt-auto pt-3">
        {summary.levels ? (
          <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
            {["Easy", "Medium", "Hard"].map((level) => <span key={level} style={{ width: `${(summary.levels[level] / Math.max(1, summary.levels.total)) * 100}%`, backgroundColor: DIFFICULTY_COLORS[level] }} />)}
          </div>
        ) : summary.bar !== undefined && summary.bar !== null ? <ProgressBar value={summary.bar} label={`${section.label} progress`} /> : null}
      </div>
    </Link>
  );
}

export default function OverviewPage({ insights, badges, onOpenTopic }) {
  const features = visibleSections(insights).filter((section) => section.id !== "overview");
  const hasBadges = Boolean(badges.loading || badges.data);
  return (
    <div className="space-y-8">
      <Section id="overview" data-guide="an-summary" info={<GuideInfo step="an-summary" />} icon={SECTION_ICONS.overview} title="Your preparation at a glance" subtitle="Tap any number to open its full analysis" actions={<LastActiveList insights={insights} />}>
        <SummaryHero insights={insights} />
      </Section>

      <Reveal className={`grid gap-3 ${hasBadges ? "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        <RevealItem data-guide="an-heatmap"><HeatmapCard activity={insights.activity} compact /></RevealItem>
        {hasBadges && <RevealItem><BadgesCard badges={badges} /></RevealItem>}
      </Reveal>

      <Section id="next" data-guide="an-next" info={<GuideInfo step="an-next" />} icon={Compass} title="What to do next" subtitle="Picked from your own numbers. Each step opens the place to act.">
        <CoachPanel steps={insights.coach} onOpenTopic={onOpenTopic} />
      </Section>

      <Section id="explore" data-guide="an-explore" icon={LayoutGrid} title="Explore your analysis" subtitle="Open any part for its full analysis">
        <Reveal className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" stagger={0.04}>
          {features.map((section) => <RevealItem key={section.id}><FeatureCard section={section} insights={insights} badges={badges} /></RevealItem>)}
        </Reveal>
      </Section>

      {insights.records.length > 0 && <RecordsCard records={insights.records} wide />}
    </div>
  );
}
