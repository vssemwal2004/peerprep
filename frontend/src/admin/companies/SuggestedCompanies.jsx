import { useCallback, useState } from 'react';
import { BadgeCheck, Building2, CircleCheck, Inbox } from 'lucide-react';
import { api } from '../../utils/api';
import { Notice, Page, PageHeader, Segmented, StatCard } from '../quickprep/ui';
import { plural } from '../quickprep/format';
import { ThresholdCard } from './companyUi';
import CompanyRequests from './CompanyRequests';
import QuestionTags from './QuestionTags';

const VIEWS = [{ value: 'requests', label: 'Requests' }, { value: 'tags', label: 'Question tags' }];

/** Super admin: moderate student-reported interview companies and watch question tags gather confirmations. */
export default function SuggestedCompanies() {
  const [view, setView] = useState('requests');
  const [opened, setOpened] = useState({ requests: true });
  const [summary, setSummary] = useState(null);
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState(null);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const onLoaded = useCallback((data) => setSummary((previous) => ({ counts: data.counts || {}, verifiedTags: data.verifiedTags ?? 0, threshold: data.threshold ?? previous?.threshold })), []);
  const show = (next) => { setView(next); setOpened((previous) => ({ ...previous, [next]: true })); };
  const counts = summary?.counts || {};
  const value = (number) => (summary ? number ?? 0 : '—');

  const saveThreshold = async (voteThreshold) => {
    try {
      const { threshold } = await api.updateCompanyVoteSettings({ voteThreshold });
      setSummary((previous) => ({ ...previous, threshold }));
      setMessage({ tone: 'success', text: `Question tags now need ${plural(threshold, 'confirmation')} from different students.` });
      refresh();
      return true;
    } catch (cause) {
      setMessage({ tone: 'error', text: cause.message || 'The vote threshold could not be saved.' });
      return false;
    }
  };

  return <Page>
    <PageHeader icon={Building2} title="Suggested companies" crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Settings' }, { label: 'Suggested companies' }]}
      description="Companies students reported after solving questions. Approve or merge them before they can tag questions. A tag appears on a question only after enough different students confirm it." />

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={Inbox} label="Pending review" value={value(counts.pending)} hint="New names waiting for a decision" tone="amber" />
      <StatCard icon={CircleCheck} label="Approved" value={value(counts.approved)} hint={summary ? `${counts.merged ?? 0} merged · ${counts.rejected ?? 0} rejected` : undefined} tone="emerald" />
      <StatCard icon={BadgeCheck} label="Verified question tags" value={value(summary?.verifiedTags)} hint="Visible to students" tone="sky" />
      <ThresholdCard threshold={summary?.threshold} onSave={saveThreshold} />
    </div>

    {message && <Notice tone={message.tone} onClose={() => setMessage(null)}>{message.text}</Notice>}

    <Segmented label="View" value={view} onChange={show} options={VIEWS} />
    <div hidden={view !== 'requests'}><CompanyRequests threshold={summary?.threshold} version={version} onLoaded={onLoaded} onChanged={refresh} notify={setMessage} /></div>
    {opened.tags && <div hidden={view !== 'tags'}><QuestionTags threshold={summary?.threshold} version={version} /></div>}
  </Page>;
}
