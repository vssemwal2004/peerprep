// State for the ANVI resume check: grammar (in the browser) + ATS (server reads
// the exported PDF) + job match + "Explain with ANVI". The last result is kept
// per student in this browser so the hub and the editor round-trip keep it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../utils/api';
import { checkGrammar, grammarEngineLoaded, lintUnit } from './grammarEngine';
import { atsSignature, collectTextUnits, explainPayload, grammarSignature, readUnitRaw, replaceInRaw, toPlain, writeUnitRaw } from './reviewModel';

const storageKey = (userId) => `prep-resume-check:v1:${userId || 'me'}`;

export function readLastCheck(userId) {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(userId)) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch { return null; }
}

function writeLastCheck(userId, value) {
  try { window.localStorage.setItem(storageKey(userId), JSON.stringify(value)); } catch { /* private mode or full: results stay in memory */ }
}

const IDLE_GRAMMAR = { status: 'idle', issues: [], signature: '', lineCount: 0, progress: { done: 0, total: 0 }, error: '', loadingEngine: false };
const IDLE_ATS = { status: 'idle', report: null, signature: '', template: '', checkedAt: '', error: '', stage: '' };

export function useResumeCheck({ userId, resume, buildPdf, onResumeChange }) {
  const saved = useMemo(() => readLastCheck(userId), [userId]);
  const [grammar, setGrammar] = useState(() => (saved?.grammar ? { ...IDLE_GRAMMAR, ...saved.grammar, status: 'done' } : IDLE_GRAMMAR));
  const [ats, setAts] = useState(() => (saved?.ats ? { ...IDLE_ATS, ...saved.ats, status: 'done' } : IDLE_ATS));
  const [jobText, setJobText] = useState(saved?.jobText || '');
  const [ignored, setIgnored] = useState(() => new Set(saved?.ignored || []));
  const [explain, setExplain] = useState({ status: 'idle', data: null, error: '', key: '' });
  const resumeRef = useRef(resume);
  resumeRef.current = resume;
  const runId = useRef(0);

  // Persist the finished results (not transient progress).
  useEffect(() => {
    if (grammar.status === 'running' || ats.status === 'running') return;
    writeLastCheck(userId, {
      grammar: grammar.status === 'done' ? { issues: grammar.issues, signature: grammar.signature, lineCount: grammar.lineCount, checkedAt: grammar.checkedAt } : null,
      ats: ats.status === 'done' ? { report: ats.report, signature: ats.signature, template: ats.template, checkedAt: ats.checkedAt } : null,
      jobText,
      ignored: [...ignored],
    });
  }, [userId, grammar, ats, jobText, ignored]);

  const runGrammar = useCallback(async (value, id) => {
    setGrammar((current) => ({ ...current, status: 'running', error: '', loadingEngine: !grammarEngineLoaded(), progress: { done: 0, total: collectTextUnits(value).length } }));
    try {
      const result = await checkGrammar(value, { onProgress: (done, total) => { if (runId.current === id) setGrammar((current) => ({ ...current, loadingEngine: false, progress: { done, total } })); } });
      if (runId.current !== id) return;
      setGrammar({ ...IDLE_GRAMMAR, status: 'done', issues: result.issues, signature: result.signature, lineCount: result.lineCount, checkedAt: new Date().toISOString(), progress: { done: result.lineCount, total: result.lineCount } });
    } catch (error) {
      if (runId.current !== id) return;
      setGrammar((current) => ({ ...current, status: 'error', loadingEngine: false, error: /fetch|network|wasm|load/i.test(String(error?.message)) ? 'ANVI could not load its language engine. Check your connection and try again.' : 'The grammar check stopped unexpectedly. Please try again.' }));
    }
  }, []);

  const runAts = useCallback(async (value, id, jobDescription) => {
    setAts((current) => ({ ...current, status: 'running', stage: 'export', error: '' }));
    try {
      const blob = await buildPdf(value);
      if (runId.current !== id) return;
      setAts((current) => ({ ...current, stage: 'read' }));
      const { report, checkedAt } = await api.checkResumeAts(blob, jobDescription);
      if (runId.current !== id) return;
      setAts({ ...IDLE_ATS, status: 'done', report, signature: atsSignature(value), template: value.template, checkedAt });
    } catch (error) {
      if (runId.current !== id) return;
      setAts((current) => ({ ...current, status: 'error', stage: '', error: error?.message || 'The ATS check could not finish. Please try again.' }));
    }
  }, [buildPdf]);

  const runCheck = useCallback(({ only = null } = {}) => {
    const id = ++runId.current;
    const value = resumeRef.current;
    setExplain({ status: 'idle', data: null, error: '', key: '' });
    return Promise.all([
      only === 'ats' ? null : runGrammar(value, id),
      only === 'grammar' ? null : runAts(value, id, jobText.trim()),
    ]);
  }, [jobText, runAts, runGrammar]);

  const runJobMatch = useCallback((text) => {
    setJobText(text);
    const id = ++runId.current;
    return runAts(resumeRef.current, id, String(text || '').trim());
  }, [runAts]);

  /** Applies one suggestion, then re-checks just that line. */
  const applyFix = useCallback(async (issue, suggestion) => {
    const current = resumeRef.current;
    const unit = collectTextUnits(current).find((item) => item.id === issue.unitId);
    const raw = unit ? readUnitRaw(current, unit) : null;
    if (raw === null || toPlain(raw).text !== issue.plainText) return { ok: false, reason: 'changed' };
    const nextRaw = replaceInRaw(raw, toPlain(raw), issue.start, issue.end, suggestion);
    const next = writeUnitRaw(current, unit, nextRaw);
    onResumeChange(next);
    resumeRef.current = next;
    let fresh = [];
    try {
      const linter = await (await import('./grammarEngine')).loadGrammarEngine();
      fresh = await lintUnit(linter, { ...unit, raw: nextRaw });
    } catch { /* keep the others; the line simply drops its issues */ }
    setGrammar((state) => ({ ...state, issues: [...state.issues.filter((item) => item.unitId !== unit.id), ...fresh], signature: grammarSignature(next) }));
    return { ok: true };
  }, [onResumeChange]);

  const ignore = useCallback((issue) => setIgnored((set) => new Set(set).add(issue.ignoreKey)), []);
  const unignoreAll = useCallback(() => setIgnored(new Set()), []);

  const visibleIssues = useMemo(() => grammar.issues.filter((item) => !ignored.has(item.ignoreKey)), [grammar.issues, ignored]);
  const ignoredCount = grammar.issues.length - visibleIssues.length;

  const grammarOutdated = grammar.status === 'done' && grammar.signature !== grammarSignature(resume);
  const atsOutdated = ats.status === 'done' && ats.signature !== atsSignature(resume);

  const runExplain = useCallback(async () => {
    const key = `${ats.signature}|${grammar.signature}|${ats.report?.job?.score ?? ''}`;
    setExplain({ status: 'running', data: null, error: '', key });
    try {
      const { explanation } = await api.explainResumeCheck(explainPayload({ resume: resumeRef.current, report: ats.report, issues: visibleIssues }));
      setExplain({ status: 'done', data: explanation, error: '', key });
    } catch (error) {
      setExplain({ status: 'error', data: null, error: error?.message || 'ANVI could not explain this check right now.', key });
    }
  }, [ats.report, ats.signature, grammar.signature, visibleIssues]);

  const running = grammar.status === 'running' || ats.status === 'running';
  const hasResult = grammar.status === 'done' || ats.status === 'done';

  return {
    grammar, ats, explain, jobText, setJobText, visibleIssues, ignoredCount,
    grammarOutdated, atsOutdated, running, hasResult,
    runCheck, runJobMatch, applyFix, ignore, unignoreAll, runExplain,
  };
}
