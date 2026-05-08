import { useState } from 'react';
import { X, Layers, LayoutList, Target, Timer, Zap, ShieldAlert, Clock, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDateTime, formatDuration } from './ReportComponents';
import { DonutChart, HorizontalProgress } from './ReportCharts';

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
                <div className="text-[10px] text-slate-400 dark:text-gray-500 mt-0.5">{section.type} · {section.totalQuestions} questions</div>
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
  return (
    <div className="space-y-2">
      {questions.map((q, idx) => {
        const isCorrect = q.isCorrect;
        const isSkipped = q.isSkipped;
        const border = isCorrect ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10' : isSkipped ? 'border-slate-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-800' : 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/10';
        const numColor = isCorrect ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : isSkipped ? 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-gray-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
        const scoreColor = isCorrect ? 'text-emerald-700 dark:text-emerald-300' : isSkipped ? 'text-slate-500 dark:text-gray-400' : 'text-rose-700 dark:text-rose-300';
        return (
          <div key={idx} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${border}`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${numColor}`}>{idx + 1}</div>
              <div className="max-w-[240px] truncate text-xs font-medium text-slate-700 dark:text-gray-200" title={q.questionText}>{q.questionText || 'Question'}</div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-[10px] text-slate-400 dark:text-gray-500">{q.timeSpentSec}s</span>
              <span className={`text-xs font-bold ${scoreColor}`}>
                {isCorrect ? '+' : isSkipped ? '0' : '-'}{q.marksObtained ?? 0}
              </span>
            </div>
          </div>
        );
      })}
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
      <div className="relative flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:max-w-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-lg font-bold text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              {(student.studentName || 'U').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{student.studentName || 'Unknown'}</h2>
              <p className="text-xs text-slate-500 dark:text-gray-400">{student.studentId || student.studentRollNo || '—'} · {formatDateTime(student.attemptDate)}</p>
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
                        <DonutChart score={data.score || 0} total={data.totalMarks || 100} size={80} stroke={6} />
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
                <SecurityInfo info={data.securityInfo} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
