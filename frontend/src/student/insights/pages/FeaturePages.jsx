import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { periodLabel } from "../insightModel";
import TopicsSection from "../components/TopicsSection";

const PREFS_KEY = "peerprep:analysis:topics:v1";
const DEFAULT_TOPICS = { view: "list", state: "all", coreOnly: false, search: "", sort: "size", limit: 15 };

function readTopicPrefs() {
  try { return JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch { return {}; }
}

/** The full topic list (list / map / coverage, with filters), shown at the end of Prep Coding. */
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
  return <TopicsSection coverage={insights.coverage} filters={filters} onFilters={setFilters} onOpenTopic={onOpenTopic} periodLabel={periodLabel(insights.range)} />;
}
