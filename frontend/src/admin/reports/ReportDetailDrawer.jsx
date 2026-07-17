import { useEffect, useState } from 'react';
import { X, Layers, LayoutList, Target, Timer, Zap, ShieldAlert, BookOpen, ChevronDown, ChevronUp, Code2, CheckCircle2, XCircle, LoaderCircle } from 'lucide-react';
import { formatDateTime, formatDuration } from './ReportComponents';
import { DonutChart, HorizontalProgress } from './ReportCharts';
import AIProctoringReportPanel from '../../features/assessment/admin/components/AIProctoringReportPanel';

function SectionBreakdown({ sections }) {
  const [open, setOpen] = useState({});
  return (
    <div className="space-y-3">
      {sections.map((section, idx) => {
        const isOpen = open[idx] !== false;
        return (
          <div key={idx} className="rounded-xl border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900 overflow-hidden">
            <button onClick={() => setOpen((p) => ({ ...p, [idx]: !isOpen }))} className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50 dark:hover:bg-gray-800">
              <div>
                <div className="font-semibold text-sm text-slate-900 dark:text-white">{section.sectionName}</div>
                <div className="text-[10px] text-slate-400 dark:text-gray-500 mt-0.5">{section.type} - {section.totalQuestions} questions</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{section.score ?? 0} / {section.totalMarks ?? 0}</div>
                  <div className="text-[10px] text-slate-400 dark:text-gray-500">{((section.score / (section.totalMarks || 1)) * 100).toFixed(0)}%</div>
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-slate-100 px-4 py-3 dark:border-gray-800">
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Correct', value: section.correctAnswers || 0, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/10' },
                    { label: 'Wrong', value: section.wrongAnswers || 0, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/10' },
                    { label: 'Skipped', value: section.skippedQuestions || 0, color: 'text-slate-500 dark:text-gray-400', bg: 'bg-slate-50 dark:bg-gray-800' },
                    { label: 'Pending', value: section.pendingEvaluationQuestions || 0, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/10' },
                  ].map((item) => (
                    <div key={item.label} className={`rounded-lg px-2 py-2 text-center ${item.bg}`}>
                      <div className={`text-sm font-bold ${item.color}`}>{item.value}</div>
                      <div className="text-[10px] text-slate-400 dark:text-gray-500">{item.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <HorizontalProgress value={section.score || 0} max={section.totalMarks || 1} height={4} color="#0ea5e9" />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function QuestionPerformance({ questions }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [questions]);

  const selected = questions[Math.min(selectedIndex, Math.max(0, questions.length - 1))];
  const isCoding = selected?.type === 'coding';
  const isPending = selected?.status === 'pending';
  const testSummary = selected?.testSummary || {};
  const verdict = selected?.executionVerdict || (selected?.isCorrect ? 'AC' : isPending ? 'PENDING' : selected?.isSkipped ? 'SKIPPED' : 'WA');
  const verdictStyle = selected?.isCorrect
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
    : isPending
      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
      : selected?.isSkipped
        ? 'border-slate-200 bg-slate-50 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
        : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300';

  const answerText = selected?.studentAnswer === undefined || selected?.studentAnswer === null || selected?.studentAnswer === ''
    ? 'No answer submitted'
    : typeof selected.studentAnswer === 'string'
      ? selected.studentAnswer
      : JSON.stringify(selected.studentAnswer, null, 2);

  return (
    <div className="grid min-h-[520px] overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900 sm:grid-cols-[220px_minmax(0,1fr)]">
      <div className="max-h-56 overflow-y-auto border-b border-slate-200 bg-slate-50/70 p-2 dark:border-gray-700 dark:bg-gray-950/40 sm:max-h-[calc(100vh-15rem)] sm:border-b-0 sm:border-r">
        <div className="mb-2 px-2 text-[10px] font-semibold uppercase text-slate-400">{questions.length} questions</div>
        <div className="space-y-1">
          {questions.map((question, index) => {
            const pending = question.status === 'pending';
            const Icon = question.isCorrect ? CheckCircle2 : pending ? LoaderCircle : question.isSkipped ? BookOpen : XCircle;
            const iconColor = question.isCorrect ? 'text-emerald-600' : pending ? 'text-amber-600' : question.isSkipped ? 'text-slate-400' : 'text-rose-600';
            return (
              <button
                key={`${question.sectionIndex}-${question.questionIndex}-${index}`}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${selectedIndex === index ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-900/20' : 'border-transparent hover:bg-white dark:hover:bg-gray-800'}`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-[11px] font-bold text-slate-700 shadow-sm dark:bg-gray-800 dark:text-gray-200">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800 dark:text-gray-100">{question.questionText || `Question ${index + 1}`}</span>
                  <span className="mt-0.5 block text-[10px] capitalize text-slate-400">{question.type || 'question'}</span>
                </span>
                <Icon className={`h-4 w-4 shrink-0 ${iconColor} ${pending ? 'animate-spin' : ''}`} />
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="min-w-0 space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase text-slate-400">{selected.sectionName || 'Assessment'} / Question {selectedIndex + 1}</div>
              <h4 className="mt-1 text-sm font-semibold leading-6 text-slate-900 dark:text-white">{selected.questionText || 'Question'}</h4>
            </div>
            <span className={`rounded-md border px-2 py-1 text-[11px] font-bold ${verdictStyle}`}>{verdict}</span>
          </div>

          {isCoding ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {[
                  ['Language', selected.language || '-'],
                  ['Tests', testSummary.total ? `${testSummary.passed || 0} / ${testSummary.total}` : verdict === 'AC' ? 'Passed' : '-'],
                  ['Runtime', Number(testSummary.time) > 0 ? `${testSummary.time}s` : '-'],
                  ['Memory', Number(testSummary.memory) > 0 ? `${testSummary.memory} KB` : '-'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                    <div className="text-[10px] font-semibold uppercase text-slate-400">{label}</div>
                    <div className="mt-1 truncate text-xs font-bold text-slate-800 dark:text-gray-100">{value}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300"><Code2 className="h-3.5 w-3.5" /> Submitted code</span>
                  <span className="text-[10px] uppercase text-slate-500">{selected.language || 'text'}</span>
                </div>
                <pre className="max-h-[380px] overflow-auto p-4 text-xs leading-5 text-slate-100"><code>{selected.sourceCode || 'No code submitted'}</code></pre>
              </div>

              {(testSummary.error || testSummary.failedTestCase) && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-200">
                  <div className="font-bold">Execution details</div>
                  {testSummary.error && <pre className="mt-2 overflow-auto whitespace-pre-wrap font-mono">{testSummary.error}</pre>}
                  {testSummary.failedTestCase && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div><span className="font-semibold">Expected:</span><pre className="mt-1 whitespace-pre-wrap font-mono">{testSummary.failedTestCase.expected || testSummary.failedTestCase.expectedOutput || '-'}</pre></div>
                      <div><span className="font-semibold">Received:</span><pre className="mt-1 whitespace-pre-wrap font-mono">{testSummary.failedTestCase.actual || testSummary.failedTestCase.actualOutput || '-'}</pre></div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-[10px] font-semibold uppercase text-slate-400">Student answer</div>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-800 dark:text-gray-100">{answerText}</pre>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-xs dark:border-gray-700">
            <span className="text-slate-500 dark:text-gray-400">Score</span>
            <span className="font-bold text-slate-900 dark:text-white">{selected.marksObtained ?? 0} / {selected.maxMarks ?? 0}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SecurityInfo({ info }) {
  if (!info) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
        <ShieldAlert className="h-4 w-4 text-rose-600" />
        Security & Violations
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Tab Switches', info.tabSwitches || 0],
          ['Fullscreen Exits', info.fullscreenExits || 0],
          ['Camera Flags', info.cameraFlags || 0],
          ['Copy/Paste', info.copyPasteCount || 0],
        ].map(([label, value]) => (
          <div key={label} className={`rounded-lg px-3 py-2 text-center ${value > 0 ? 'bg-rose-50 dark:bg-rose-900/10' : 'bg-slate-50 dark:bg-gray-800'}`}>
            <div className={`text-lg font-bold ${value > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-700 dark:text-gray-300'}`}>{value}</div>
            <div className="text-[10px] text-slate-400 dark:text-gray-500">{label}</div>
          </div>
        ))}
      </div>
      {info.location && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-gray-800 dark:text-gray-300">
          <span className="font-semibold">Location:</span> Lat {Number(info.location.latitude).toFixed(4)}, Long {Number(info.location.longitude).toFixed(4)} (±{Math.round(info.location.accuracy)}m)
        </div>
      )}
    </div>
  );
}

export default function ReportDetailDrawer({ student, loading, data, onClose, openViolationReport }) {
  const [tab, setTab] = useState('overview'); // overview | questions | security
  if (!student) return null;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Target },
    { id: 'questions', label: 'Questions', icon: LayoutList },
    { id: 'security', label: 'Security', icon: ShieldAlert },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-5xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-lg font-bold text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              {(student.studentName || 'U').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{student.studentName || 'Unknown'}</h2>
              <p className="text-xs text-slate-500 dark:text-gray-400">{student.studentId || student.studentRollNo || '-'} - {formatDateTime(student.attemptDate)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {student.violationCount > 0 && (
              <button onClick={() => openViolationReport(student._id)} className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/30">
                <ShieldAlert className="inline h-3 w-3 mr-1" />
                {student.violationCount} violations
              </button>
            )}
            <button onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-200 dark:border-gray-700">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${tab === t.id ? 'border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-300' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-300'}`}>
                <Icon className="h-3.5 w-3.5" />{t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-gray-800" />
              ))}
            </div>
          ) : !data ? (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-slate-400 dark:text-gray-500">
              <BookOpen className="h-10 w-10" />
              <p className="text-sm">Select a student to view detailed report.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {tab === 'overview' && (
                <>
                  {/* Score Card */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-between">
                      <div className="flex items-center gap-4">
                        <DonutChart value={data.score || 0} total={data.totalMarks || 100} size={80} stroke={6} />
                        <div>
                          <div className="text-3xl font-bold text-slate-900 dark:text-white">{data.score ?? 0}<span className="text-base font-normal text-slate-400 dark:text-gray-500"> / {data.totalMarks || 100}</span></div>
                          <div className="text-xs text-slate-500 dark:text-gray-400">Final Score</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                          { label: 'Accuracy', value: `${data.accuracy ?? 0}%`, icon: Target, color: 'text-sky-600' },
                          { label: 'Time', value: formatDuration(data.timeTakenSec), icon: Timer, color: 'text-amber-600' },
                          { label: 'Correct', value: data.correctAnswers || 0, icon: Zap, color: 'text-emerald-600' },
                          { label: 'Wrong', value: data.wrongAnswers || 0, icon: X, color: 'text-rose-600' },
                        ].map((stat) => (
                          <div key={stat.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center dark:border-gray-700 dark:bg-gray-900">
                            <stat.icon className={`mx-auto h-3.5 w-3.5 ${stat.color}`} />
                            <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{stat.value}</div>
                            <div className="text-[10px] text-slate-400 dark:text-gray-500">{stat.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Section Breakdown */}
                  {data.sectionBreakdown?.length > 0 && (
                    <div>
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                        <Layers className="h-4 w-4 text-sky-600" />Section Breakdown
                      </h3>
                      <SectionBreakdown sections={data.sectionBreakdown} />
                    </div>
                  )}
                </>
              )}

              {tab === 'questions' && data.questionWise?.length > 0 && (
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                    <LayoutList className="h-4 w-4 text-sky-600" />Question Performance
                  </h3>
                  <QuestionPerformance questions={data.questionWise} />
                </div>
              )}

              {tab === 'security' && (
                <div className="space-y-4">
                  <SecurityInfo info={data.securityInfo} />
                  <AIProctoringReportPanel
                    aiProctoringSummary={data.aiProctoringSummary}
                    violations={data.aiViolationLog || []}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
