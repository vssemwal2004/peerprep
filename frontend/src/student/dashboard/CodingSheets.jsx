import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import useQuests from '../quests/useQuests';
import QuestCard from '../quests/QuestCard';
import { questState } from '../quests/questTheme';
import { SectionHeader, Skeleton, textLink, Unavailable } from './ui';

const SHOWN = 3;
const STATE_ORDER = { active: 0, new: 1, completed: 2 };
const recency = (quest) => new Date(quest.lastViewedAt || quest.startedAt || 0).getTime();

/** Three QuickPrep coding sheets as full cards: in progress (most recent first), then new, then completed. */
export default function CodingSheets() {
  const { quests, loading, error, reload } = useQuests();
  const ordered = [...quests].sort((a, b) => (STATE_ORDER[questState(a)] ?? 3) - (STATE_ORDER[questState(b)] ?? 3) || recency(b) - recency(a));
  if (!loading && !error && !quests.length) return null;

  return <section aria-labelledby="dashboard-sheets-title">
    <SectionHeader id="dashboard-sheets-title" title="Coding sheets"
      action={<Link className={textLink} to="/student/quickprep">View all{quests.length > SHOWN ? ` (${quests.length})` : ''}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>} />
    {loading && !quests.length
      ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((value) => <Skeleton key={value} className="h-[330px] rounded-2xl" />)}</div>
      : error && !quests.length
        ? <Unavailable message="Coding sheets could not be loaded." onRetry={reload} />
        : <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ordered.slice(0, SHOWN).map((quest, index) => <li key={quest.id} className="dashboard-rise flex [&>a]:flex-1" style={{ '--rise': index + 3 }}><QuestCard quest={quest} /></li>)}
        </ul>}
  </section>;
}
