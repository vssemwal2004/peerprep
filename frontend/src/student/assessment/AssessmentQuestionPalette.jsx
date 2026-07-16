import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, PanelRightOpen, Pin, PinOff } from 'lucide-react';

const PAGE_SIZE = 30;

function AssessmentQuestionPalette({
  assessmentTitle,
  questions = [],
  activeSection,
  activeQuestion,
  questionStatus,
  canNavigate,
  onNavigate,
  onSubmit,
  isSubmitted = false,
  saving = false,
  dockable = false,
}) {
  const activeType = questions.find((item) => item.sectionIndex === activeSection && item.questionIndex === activeQuestion)?.kind || 'mcq';
  const mcqCount = questions.filter((item) => item.kind === 'mcq').length;
  const codingCount = questions.filter((item) => item.kind === 'coding').length;
  const hasMcq = mcqCount > 0;
  const hasCoding = codingCount > 0;
  const [filter, setFilter] = useState(activeType);
  const [page, setPage] = useState(0);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const rootRef = useRef(null);
  const expanded = !dockable || pinned || hovered;

  const filteredQuestions = useMemo(() => questions.filter((item) => item.kind === filter), [questions, filter]);
  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visibleQuestions = filteredQuestions.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    setFilter(activeType);
  }, [activeType]);

  useEffect(() => {
    const activeIndex = filteredQuestions.findIndex((item) => item.sectionIndex === activeSection && item.questionIndex === activeQuestion);
    if (activeIndex >= 0) setPage(Math.floor(activeIndex / PAGE_SIZE));
  }, [filteredQuestions, activeSection, activeQuestion]);

  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  useEffect(() => {
    if (!dockable || pinned || !hovered) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setHovered(false);
    };
    const closeOnOutsidePress = (event) => {
      if (!rootRef.current?.contains(event.target)) setHovered(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsidePress);
    };
  }, [dockable, hovered, pinned]);

  const counts = useMemo(() => filteredQuestions.reduce((summary, item) => {
    const status = questionStatus(item.sectionIndex, item.questionIndex);
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, { answered: 0, unanswered: 0, review: 0 }), [filteredQuestions, questionStatus]);

  const rangeStart = filteredQuestions.length ? safePage * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(filteredQuestions.length, (safePage + 1) * PAGE_SIZE);
  const typeLabel = filter === 'coding' ? 'Coding' : 'MCQ / Short';

  return (
    <div
      ref={rootRef}
      className={`relative z-30 w-full flex-none overflow-visible lg:h-full ${
        dockable ? (pinned ? 'lg:w-[18rem]' : 'lg:w-12') : 'lg:w-[18rem]'
      }`}
      onMouseEnter={() => { if (dockable && !pinned) setHovered(true); }}
      onMouseLeave={() => { if (dockable && !pinned) setHovered(false); }}
      onFocusCapture={() => { if (dockable && !pinned) setHovered(true); }}
      onBlurCapture={(event) => {
        if (dockable && !pinned && !event.currentTarget.contains(event.relatedTarget)) setHovered(false);
      }}
    >
      {dockable ? (
        <button
          type="button"
          onClick={() => setMobileOpen((current) => !current)}
          aria-expanded={mobileOpen}
          className="mb-2 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm lg:hidden dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        >
          <span className="inline-flex items-center gap-2"><PanelRightOpen className="h-4 w-4 text-sky-600" /> Questions</span>
          <span className="text-xs font-medium text-slate-400">{mobileOpen ? 'Hide' : 'Show'}</span>
        </button>
      ) : null}
      <aside
        className={`${dockable && !mobileOpen ? 'hidden lg:flex' : 'flex'} w-full flex-none flex-col overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-[0_22px_55px_-28px_rgba(15,23,42,0.36)] transition-transform duration-200 ease-out dark:border-gray-700 dark:bg-gray-900 lg:h-full lg:w-[18rem] ${
          dockable
            ? `${pinned ? 'lg:relative' : 'lg:absolute lg:right-0 lg:top-0'} ${expanded ? 'lg:translate-x-0' : 'lg:translate-x-[calc(100%_-_3rem)]'}`
            : ''
        }`}
        aria-label="Assessment question palette"
      >
        {dockable ? (
          <button
            type="button"
            onClick={() => setHovered(true)}
            aria-label="Open question palette"
            className={`absolute inset-y-0 left-0 z-30 hidden w-12 flex-col items-center justify-center gap-3 border-r border-sky-700 bg-slate-950 text-white transition-opacity lg:flex ${
              expanded ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
          >
            <PanelRightOpen className="h-4 w-4 text-sky-300" />
            <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">Questions</span>
          </button>
        ) : null}

        <div className="border-b border-slate-200/70 bg-slate-50/70 px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-600">Question palette</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{assessmentTitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${saving ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {saving ? 'Saving' : 'Saved'}
              </span>
              {dockable ? (
                <button
                  type="button"
                  onClick={() => setPinned((current) => !current)}
                  aria-pressed={pinned}
                  aria-label={pinned ? 'Unpin question palette' : 'Pin question palette'}
                  title={pinned ? 'Unpin question palette' : 'Pin question palette'}
                  className={`hidden h-8 w-8 items-center justify-center rounded-lg border transition-colors lg:inline-flex ${
                    pinned
                      ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/25 dark:text-sky-300'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {hasMcq && hasCoding ? (
          <div className="grid grid-cols-2 gap-1 border-b border-slate-100 p-2 dark:border-gray-800">
            <button type="button" onClick={() => { setFilter('mcq'); setPage(0); }} className={`rounded-xl px-2 py-2 text-xs font-semibold transition-colors ${filter === 'mcq' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
              MCQ <span className={filter === 'mcq' ? 'text-sky-100' : 'text-slate-400'}>{mcqCount}</span>
            </button>
            <button type="button" onClick={() => { setFilter('coding'); setPage(0); }} className={`rounded-xl px-2 py-2 text-xs font-semibold transition-colors ${filter === 'coding' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
              Coding <span className={filter === 'coding' ? 'text-sky-100' : 'text-slate-400'}>{codingCount}</span>
            </button>
          </div>
        ) : (
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-600 dark:border-gray-800 dark:text-gray-300">
            {typeLabel} <span className="ml-1 text-slate-400">{filteredQuestions.length}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-[10px] font-semibold text-slate-500 dark:text-gray-400">
          <div className="flex items-center gap-3" aria-label="Question status counts">
            <span title="Answered"><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />{counts.answered}</span>
            <span title="Marked for review"><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />{counts.review}</span>
            <span title="Not answered"><i className="mr-1 inline-block h-2 w-2 rounded-full border border-slate-300 bg-white dark:border-gray-600 dark:bg-gray-900" />{counts.unanswered}</span>
          </div>
          <span>{rangeStart}-{rangeEnd} of {filteredQuestions.length}</span>
        </div>

        <div className="grid grid-cols-6 gap-1.5 px-3 pb-3 sm:grid-cols-10 lg:grid-cols-6">
          {visibleQuestions.map((item) => {
            const status = questionStatus(item.sectionIndex, item.questionIndex);
            const active = item.sectionIndex === activeSection && item.questionIndex === activeQuestion;
            const allowed = canNavigate(item.sectionIndex, item.questionIndex);
            const displayNumber = item.typeNumber || item.number;
            const tone = active
              ? 'border-sky-600 bg-sky-600 text-white shadow-sm ring-2 ring-sky-100 dark:ring-sky-900/40'
              : status === 'answered'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                : status === 'review'
                  ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300';
            return (
              <button
                key={`${item.sectionIndex}-${item.questionIndex}`}
                type="button"
                onClick={() => onNavigate(item.sectionIndex, item.questionIndex)}
                aria-disabled={!allowed}
                title={allowed ? `${typeLabel} question ${displayNumber} - ${status}` : 'Restricted by assessment navigation rules'}
                className={`aspect-square rounded-lg border text-[11px] font-bold transition-colors ${tone} ${!allowed && !active ? 'cursor-not-allowed opacity-45' : ''}`}
              >
                {displayNumber}
              </button>
            );
          })}
        </div>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2.5 dark:border-gray-800">
            <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={safePage === 0} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-35 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Previous question range"><ChevronLeft className="h-4 w-4" /></button>
            <div className="text-center text-[10px] font-semibold text-slate-500 dark:text-gray-400">
              <div>Page {safePage + 1} of {totalPages}</div>
              <div className="mt-0.5 text-slate-400">{rangeStart}-{rangeEnd}</div>
            </div>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} disabled={safePage === totalPages - 1} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-35 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Next question range"><ChevronRight className="h-4 w-4" /></button>
          </div>
        ) : null}

        <div className="mt-auto border-t border-slate-200/70 p-3 dark:border-gray-800">
          <button type="button" onClick={onSubmit} disabled={isSubmitted} className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
            {isSubmitted ? 'Submitted' : 'Submit Assessment'}
          </button>
        </div>
      </aside>
    </div>
  );
}

function palettePropsEqual(previous, next) {
  return previous.assessmentTitle === next.assessmentTitle
    && previous.questions === next.questions
    && previous.activeSection === next.activeSection
    && previous.activeQuestion === next.activeQuestion
    && previous.questionStatus === next.questionStatus
    && previous.isSubmitted === next.isSubmitted
    && previous.saving === next.saving
    && previous.dockable === next.dockable
    && previous.navigationRevision === next.navigationRevision;
}

export default memo(AssessmentQuestionPalette, palettePropsEqual);
