// State for the ANVI resume check: grammar (in the browser) + ATS (server reads
// the exported PDF) + job match + "Explain with ANVI". The last result is kept
// per student in this browser so the hub and the editor round-trip keep it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../utils/api';
import { getResumeRequirements } from '../resumeUtils';
import { checkGrammar, grammarEngineLoaded, lintUnit, loadGrammarEngine } from './grammarEngine';
import { atsSignature, collectTextUnits, dictionaryWords, explainPayload, grammarSignature, readUnitRaw, replaceInRaw, toPlain, writeUnitRaw } from './reviewModel';
import { followResumeScan, readPendingScan, savePendingScan } from './atsJob';

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
  const initialScan = useMemo(() => readPendingScan(userId), [userId]);
  const pendingScan = useRef(initialScan);
  const [grammar, setGrammar] = useState(() => (saved?.grammar ? { ...IDLE_GRAMMAR, ...saved.grammar, status: 'done' } : IDLE_GRAMMAR));
  const [ats, setAts] = useState(() => (saved?.ats ? { ...IDLE_ATS, ...saved.ats, status: 'done' } : IDLE_ATS));
  const [jobText, setJobText] = useState(initialScan?.jobDescription ?? saved?.jobText ?? '');
  const [ignored, setIgnored] = useState(() => new Set(saved?.ignored || []));
  const [explain, setExplain] = useState(() => saved?.explain?.status === 'done' ? saved.explain : { status: 'idle', data: null, error: '', key: '' });
  const resumeRef = useRef(resume);
  resumeRef.current = resume;
  const grammarRun = useRef(null);
  const activeScan = useRef(null);
  const explainRun = useRef(0);
  const [undo, setUndo] = useState(null);
  const requirements = useMemo(() => getResumeRequirements(resume), [resume]);
  const draftKey = useMemo(() => atsSignature(resume), [resume]);
  const writingKey = useMemo(() => grammarSignature(resume), [resume]);

  useEffect(() => () => {
    activeScan.current?.controller.abort();
    grammarRun.current?.controller.abort();
  }, [userId]);
  useEffect(() => {
    const scan = activeScan.current;
    if (scan && scan.signature !== draftKey) {
      scan.controller.abort();
      activeScan.current = null;
      setAts(IDLE_ATS);
    }
  }, [draftKey]);

  // Each lane finishes independently. Keep completed grammar available across a page reload
  // while the PDF is queued, without writing its progress counter to storage on every line.
  const finishedGrammar = grammar.status === 'done' ? grammar : null;
  const finishedAts = ats.status === 'done' ? ats : null;
  useEffect(() => {
    writeLastCheck(userId, {
      grammar: finishedGrammar ? { issues: finishedGrammar.issues, signature: finishedGrammar.signature, lineCount: finishedGrammar.lineCount, checkedAt: finishedGrammar.checkedAt } : null,
      ats: finishedAts ? { report: finishedAts.report, signature: finishedAts.signature, template: finishedAts.template, checkedAt: finishedAts.checkedAt, jobDescription: finishedAts.jobDescription } : null,
      explain: explain.status === 'done' ? explain : null,
      jobText,
      ignored: [...ignored],
    });
  }, [userId, finishedGrammar, finishedAts, jobText, ignored, explain]);

  const runGrammar = useCallback((value) => {
    const signature = grammarSignature(value);
    const previous = grammarRun.current;
    if (previous?.signature === signature && !previous.controller.signal.aborted) return previous.promise;
    previous?.controller.abort();
    const controller = new AbortController();
    const { signal } = controller;
    const run = { controller, signature };
    grammarRun.current = run;
    setGrammar((current) => ({ ...current, status: 'running', error: '', loadingEngine: !grammarEngineLoaded(), progress: { done: 0, total: collectTextUnits(value).length } }));
    run.promise = checkGrammar(value, { signal, onProgress: (done, total) => { if (!signal.aborted) setGrammar((current) => ({ ...current, loadingEngine: false, progress: { done, total } })); } }).then(result => {
      if (signal.aborted) return;
      setGrammar({ ...IDLE_GRAMMAR, status: 'done', issues: result.issues, signature: result.signature, lineCount: result.lineCount, checkedAt: new Date().toISOString(), progress: { done: result.lineCount, total: result.lineCount } });
    }).catch(error => {
      if (signal.aborted) return;
      setGrammar((current) => ({ ...current, status: 'error', loadingEngine: false, error: /fetch|network|wasm|load/i.test(String(error?.message)) ? 'ANVI could not load its language engine. Check your connection and try again.' : 'The grammar check stopped unexpectedly. Please try again.' }));
    }).finally(() => { if (grammarRun.current === run) grammarRun.current = null; });
    return run.promise;
  }, []);

  const runAts = useCallback((value, jobDescription, force = false) => {
    if (!getResumeRequirements(value).ready) return;
    const signature = atsSignature(value);
    const previous = activeScan.current;
    if (previous?.signature === signature && previous.jobDescription === jobDescription && !previous.controller.signal.aborted) return previous.promise;
    if (!force && ats.status === 'done' && ats.signature === signature && ats.jobDescription === jobDescription) return;
    previous?.controller.abort();
    const controller = new AbortController();
    const { signal } = controller;
    const savedJob = pendingScan.current;
    const jobId = savedJob?.signature === signature && savedJob.jobDescription === jobDescription ? savedJob.jobId : null;
    setAts({ ...IDLE_ATS, signature, jobDescription, status: 'running', stage: jobId ? 'reconnect' : 'export' });
    const setStage = stage => {
      if (!signal.aborted) setAts(state => state.stage === stage ? state : { ...state, stage });
    };
    const remember = id => {
      pendingScan.current = id ? { signature, jobDescription, jobId: id } : null;
      savePendingScan(userId, pendingScan.current);
    };
    const scan = { signature, jobDescription, controller };
    activeScan.current = scan;
    scan.promise = followResumeScan({
      signal, jobId, remember, onStage: setStage, getStatus: api.getResumeAtsJob,
      submit: async () => {
        setStage('export');
        const blob = await buildPdf(value);
        signal.throwIfAborted();
        setStage('upload');
        return api.checkResumeAts(blob, jobDescription, { background: true, signal });
      },
    }).then(({ report, checkedAt }) => {
      if (!signal.aborted) setAts({ ...IDLE_ATS, status: 'done', report, signature, jobDescription, template: value.template, checkedAt });
    }).catch(error => {
      if (!signal.aborted) setAts(state => ({ ...state, status: 'error', stage: '', error: error?.message || 'The ATS check could not finish. Please try again.' }));
    }).finally(() => { if (activeScan.current === scan) activeScan.current = null; });
    return scan.promise;
  }, [buildPdf, userId, ats.status, ats.signature, ats.jobDescription]);

  const runCheck = useCallback(({ only = null, force = false } = {}) => {
    const value = resumeRef.current;
    return Promise.all([
      only === 'ats' || (!force && grammar.status === 'done' && grammar.signature === grammarSignature(value)) ? null : runGrammar(value),
      only === 'grammar' ? null : runAts(value, jobText.trim(), force),
    ]);
  }, [jobText, runAts, runGrammar, grammar.status, grammar.signature]);

  const runJobMatch = useCallback((text) => {
    setJobText(text);
    return runAts(resumeRef.current, String(text || '').trim());
  }, [runAts]);

  const changeLine = useCallback(async (unit, original, nextRaw) => {
    const current = resumeRef.current;
    if (!unit || readUnitRaw(current, unit) !== original) return { ok: false, reason: 'changed' };
    const next = writeUnitRaw(current, unit, nextRaw);
    onResumeChange(next);
    resumeRef.current = next;
    let fresh = [];
    try {
      const linter = await loadGrammarEngine();
      fresh = await lintUnit(linter, { ...unit, raw: nextRaw }, new Set(dictionaryWords(next).map(word => word.toLowerCase())));
    } catch { /* keep the others; the line simply drops its issues */ }
    if (readUnitRaw(resumeRef.current, unit) === nextRaw) {
      setGrammar((state) => ({ ...state, issues: [...state.issues.filter((item) => item.unitId !== unit.id), ...fresh], signature: state.signature === grammarSignature(current) ? grammarSignature(next) : state.signature }));
    }
    return { ok: true };
  }, [onResumeChange]);

  const replaceLine = useCallback((unit, raw, replacement) => {
    if (!unit || readUnitRaw(resumeRef.current, unit) !== raw) return { ok: false, reason: 'changed' };
    if (unit.field === 'bullet' && replacement.length > 1200) return { ok: false, reason: 'length' };
    setUndo({ unit, raw, replacement });
    return changeLine(unit, raw, replacement);
  }, [changeLine]);

  const applyFix = useCallback((issue, suggestion) => {
    const unit = collectTextUnits(resumeRef.current).find((item) => item.id === issue.unitId);
    const raw = unit && readUnitRaw(resumeRef.current, unit);
    if (!unit || toPlain(raw).text !== issue.plainText) return { ok: false, reason: 'changed' };
    return replaceLine(unit, raw, replaceInRaw(raw, toPlain(raw), issue.start, issue.end, suggestion));
  }, [replaceLine]);

  const replaceBullet = useCallback((id, raw, suggestion) => {
    const unit = collectTextUnits(resumeRef.current).find((item) => item.id === id && item.field === 'bullet');
    return replaceLine(unit, raw, suggestion);
  }, [replaceLine]);

  const undoFix = useCallback(() => {
    if (!undo) return { ok: false, reason: 'changed' };
    setUndo(null);
    return changeLine(undo.unit, undo.replacement, undo.raw);
  }, [changeLine, undo]);

  const ignore = useCallback((issue) => setIgnored((set) => new Set(set).add(issue.ignoreKey)), []);
  const unignoreAll = useCallback(() => setIgnored(new Set()), []);

  const grammarOutdated = grammar.status === 'done' && grammar.signature !== writingKey;
  const visibleIssues = useMemo(() => grammarOutdated ? [] : grammar.issues.filter((item) => !ignored.has(item.ignoreKey)), [grammar.issues, grammarOutdated, ignored]);
  const ignoredCount = grammarOutdated ? 0 : grammar.issues.length - visibleIssues.length;
  const atsOutdated = ats.status === 'done' && ats.signature !== draftKey;
  const currentAts = requirements.ready && ats.signature === draftKey ? ats : { ...ats, report: null };
  const explanationKey = JSON.stringify([draftKey, ats.checkedAt, grammar.checkedAt, visibleIssues.map(issue => issue.id)]);

  const runExplain = useCallback(async () => {
    const key = explanationKey;
    if (explain.key === key && ['running', 'done'].includes(explain.status)) return;
    const requestId = ++explainRun.current;
    setExplain({ status: 'running', data: null, error: '', key });
    try {
      const { explanation } = await api.explainResumeCheck(explainPayload({ resume: resumeRef.current, report: currentAts.report, issues: visibleIssues }));
      if (requestId !== explainRun.current) return;
      setExplain({ status: 'done', data: explanation, error: '', key });
    } catch (error) {
      if (requestId !== explainRun.current) return;
      setExplain({ status: 'error', data: null, error: error?.message || 'ANVI could not explain this check right now.', key });
    }
  }, [explain.key, explain.status, explanationKey, currentAts.report, visibleIssues]);

  const running = grammar.status === 'running' || ats.status === 'running';
  const hasResult = grammar.status === 'done' || ats.status === 'done';

  return {
    grammar, ats: currentAts, explain: explain.key === explanationKey ? explain : { status: 'idle', data: null }, jobText, setJobText, visibleIssues, ignoredCount, requirements,
    grammarOutdated, atsOutdated, running, hasResult, resumePending: Boolean(initialScan?.jobId && initialScan.signature === draftKey),
    runCheck, runJobMatch, applyFix, replaceBullet, undoFix, canUndoFix: Boolean(undo), ignore, unignoreAll, runExplain,
  };
}
