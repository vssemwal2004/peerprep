// Status and date helpers shared by All Assessments and All Mocks
// (AssessmentDashboard + prepMock/MockWorkspace).

export const assessmentLifecycleLabel = (assessment) => (assessment.lifecycleStatus === 'draft'
  ? 'Draft'
  : assessment.lifecycleStatus === 'archived' || assessment.isVisible === false ? 'Archived' : assessment.status);

export const statusStyles = {
  Draft: 'bg-slate-100 text-slate-600 border-slate-200',
  Upcoming: 'bg-amber-50 text-amber-700 border-amber-200',
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Completed: 'bg-slate-200 text-slate-700 border-slate-300',
  Archived: 'bg-violet-50 text-violet-700 border-violet-200',
};

export const displayStatus = (status) => {
  if (status === 'Active') return 'Live';
  if (status === 'Upcoming') return 'Scheduled';
  return status || 'Draft';
};

/**
 * Students who can take it. `assignedCount` is the text "All Students" when the test is open to everyone;
 * then `candidateCount` (eligible students, from the list API) is the number.
 */
export const assignedCountOf = (row) => {
  const assigned = Number(row?.assignedCount);
  if (Number.isFinite(assigned)) return assigned;
  const candidates = Number(row?.candidateCount);
  return Number.isFinite(candidates) ? candidates : 0;
};

export const formatShortDate = (value) => (
  value
    ? new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    : '-'
);

export const formatTime = (value) => (
  value
    ? new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : 'Not set'
);
