import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { periodLabel } from "../insightModel";
import TopicsSection from "../components/TopicsSection";
import { CodingSection } from "../components/PracticeSections";
import { TestsSection } from "../components/ProgressSections";
import ActivitySection from "../components/ActivitySection";
import {
  CumulativeCard, DifficultyAccuracyCard, MilestonesCard, RecentSolvesCard, RecordsCard, RhythmCard, SkillRadarCard, StrengthsCard, TestTimeCard,
  WeeklyAccuracyCard,
} from "../components/ExtraCards";
import { Reveal, RevealItem } from "../components/motion";

const PREFS_KEY = "peerprep:analysis:topics:v1";
const DEFAULT_TOPICS = { view: "list", state: "all", coreOnly: false, search: "", sort: "size", limit: 15 };

function readTopicPrefs() {
  try { return JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch { return {}; }
}

export function TopicsPage({ insights, onOpenTopic }) {
  const location = useLocation();
  const [filters, setFilters] = useState(() => {
    const saved = readTopicPrefs();
    const wanted = location.state?.topicState;
    return { ...DEFAULT_TOPICS, view: wanted ? "list" : saved.view || "list", coreOnly: wanted ? true : Boolean(saved.coreOnly), state: wanted || "all" };
  });
  useEffect(() => {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ view: filters.view, coreOnly: filters.coreOnly })); } catch { /* this visit only */ }
  }, [filters.view, filters.coreOnly]);
  const coding = insights.sections.coding;
  return (
    <div className="space-y-6">
      <TopicsSection coverage={insights.coverage} filters={filters} onFilters={setFilters} onOpenTopic={onOpenTopic} periodLabel={periodLabel(insights.range)} />
      <Reveal className="grid gap-3 lg:grid-cols-2">
        <RevealItem><SkillRadarCard topics={insights.coverage.topics} /></RevealItem>
        <RevealItem data-guide="an-strengths"><StrengthsCard topics={insights.coverage.topics} onOpenTopic={onOpenTopic} /></RevealItem>
        {coding?.growth?.length > 1 && <RevealItem className="lg:col-span-2"><CumulativeCard growth={coding.growth} /></RevealItem>}
      </Reveal>
    </div>
  );
}

export function CodingPage({ insights }) {
  const coding = insights.sections.coding;
  const previousLabel = insights.range.previous?.label || "";
  return (
    <div className="space-y-6">
      <CodingSection coding={coding} range={insights.range} previousLabel={previousLabel} />
      <Reveal className="grid gap-3 lg:grid-cols-3">
        <RevealItem className="lg:col-span-2"><WeeklyAccuracyCard daily={coding.daily} /></RevealItem>
        <RevealItem><DifficultyAccuracyCard difficulties={coding.breakdown.difficulties} /></RevealItem>
        {coding.growth.length > 1 && <RevealItem className="lg:col-span-2"><CumulativeCard growth={coding.growth} /></RevealItem>}
        <RevealItem><MilestonesCard milestones={coding.milestones} /></RevealItem>
        <RevealItem><RecentSolvesCard recent={coding.recent} /></RevealItem>
        {coding.rhythm && <RevealItem className={coding.growth.length > 1 ? "lg:col-span-2" : "lg:col-span-3"}><RhythmCard rhythm={coding.rhythm} /></RevealItem>}
      </Reveal>
    </div>
  );
}

export function TestsPage({ insights }) {
  const assessment = insights.sections.assessment;
  return (
    <div className="space-y-6">
      <TestsSection assessment={assessment} previousLabel={insights.range.previous?.label || ""} />
      <TestTimeCard tests={assessment.tests} passPercent={assessment.passPercent} />
    </div>
  );
}

export function ActivityPage({ insights }) {
  const rhythm = insights.sections.coding?.rhythm;
  return (
    <div className="space-y-6">
      <ActivitySection activity={insights.activity} access={insights.access} />
      <Reveal className={`grid gap-3 ${rhythm ? "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : ""}`}>
        {rhythm && <RevealItem><RhythmCard rhythm={rhythm} /></RevealItem>}
        <RevealItem><RecordsCard records={insights.records} /></RevealItem>
      </Reveal>
    </div>
  );
}
