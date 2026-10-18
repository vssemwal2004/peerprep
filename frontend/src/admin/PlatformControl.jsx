import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import ProgressionEditor from './platform/ProgressionEditor';
import { buildProgressionPayload, normalizeProgression, permissionOn } from './platform/progressionMath';

const modules = [
  ['learning', 'Learning'],
  ['assessments', 'Assessments'],
  ['questions', 'Question practice'],
  ['events', 'Events & peer interviews'],
  ['interviews', 'AI interviews'],
  ['resumes', 'Resumes'],
];
const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900';
const input = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const button = 'rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50';
const emptyUniversity = { universityId: '', name: '', contactEmail: '', dbUri: '', judge0Url: '', judge0AuthHeader: '', judge0AuthToken: '', adminEmail: '', adminPassword: '', interviewServiceUrl: '', interviewServiceSecret: '' };

// Server-managed progression keys (version, updatedAt, updatedBy) are stripped before copying.
const defaultsFrom = (university) => ({
  permissions: university.permissions,
  sources: university.sources,
  ...(university.progression ? { progression: buildProgressionPayload(normalizeProgression(university.progression)) } : {}),
});

// The coding toggle and progression editor stay hidden until the server returns those
// fields; older backends ignore them, so showing the controls would drop every save.
const supportsCoding = (defaults) => defaults?.permissions?.coding !== undefined;
const supportsProgression = (defaults) => Boolean(defaults?.progression);
const visibleModules = (defaults) => modules.filter(([moduleName]) => moduleName !== 'coding' || supportsCoding(defaults));

export default function PlatformControl() {
  const [overview, setOverview] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [newUniversity, setNewUniversity] = useState(emptyUniversity);
  const [newDbTest, setNewDbTest] = useState(null);
  const [connections, setConnections] = useState({});
  const [dbTests, setDbTests] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [assignments, setAssignments] = useState({});
  const [studentView, setStudentView] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentBusy, setStudentBusy] = useState(false);

  async function reload() {
    const [dashboard, publications] = await Promise.all([api.platformOverview(), api.platformPublications()]);
    setOverview(dashboard);
    setCatalog(publications);
    const next = {};
    publications.publications.forEach((item) => { next[`${item.kind}:${item.contentId}`] = item.universityIds || []; });
    setAssignments(next);
  }

  const refresh = () => reload().catch((error) => setMessage(error.message));
  useEffect(() => { reload().catch((error) => setMessage(error.message)); }, []);

  async function act(work) {
    setBusy(true);
    setMessage('');
    try { await work(); await reload(); }
    catch (error) { setMessage(error.message || 'Request failed'); }
    finally { setBusy(false); }
  }

  async function create(event) {
    event.preventDefault();
    if (newDbTest?.status !== 'success' || newDbTest.id !== newUniversity.universityId || newDbTest.uri !== newUniversity.dbUri) {
      setMessage('Test the MongoDB connection before creating the university.');
      return;
    }
    await act(async () => {
      await api.createUniversity(newUniversity);
      setNewUniversity(emptyUniversity);
      setNewDbTest(null);
    });
  }

  async function testNewDatabase() {
    const id = newUniversity.universityId;
    const uri = newUniversity.dbUri;
    setNewDbTest({ id, uri, status: 'testing' });
    try {
      await api.testUniversityDatabase(id, uri);
      setNewDbTest((current) => current?.id === id && current?.uri === uri ? { id, uri, status: 'success' } : current);
    } catch (error) {
      setNewDbTest((current) => current?.id === id && current?.uri === uri ? { id, uri, status: 'error', message: error.message || 'Connection failed' } : current);
    }
  }

  async function testExistingDatabase(id) {
    const uri = connections[id]?.dbUri || '';
    setDbTests((previous) => ({ ...previous, [id]: { uri, status: 'testing' } }));
    try {
      await api.testUniversityDatabase(id, uri);
      setDbTests((previous) => previous[id]?.uri === uri ? { ...previous, [id]: { uri, status: 'success' } } : previous);
    } catch (error) {
      setDbTests((previous) => previous[id]?.uri === uri ? { ...previous, [id]: { uri, status: 'error', message: error.message || 'Connection failed' } } : previous);
    }
  }

  const universities = overview?.universities || [];
  const defaults = overview?.defaults;
  const publicationFor = (kind, id) => catalog?.publications.find((item) => item.kind === kind && String(item.contentId) === String(id));

  function deleteUniversity(university) {
    if (!window.confirm(`Delete ${university.name} (${university.universityId}) from the main database? Its shared assessment access will be revoked. Its separate university database will remain intact.`)) return;
    act(() => api.deleteUniversity(university.universityId));
  }

  async function loadStudents(universityId, page = 1, search = studentSearch) {
    setStudentBusy(true);
    setStudentDetail(null);
    setMessage('');
    try { setStudentView({ universityId, ...await api.platformStudents(universityId, page, search) }); }
    catch (error) { setStudentView(null); setMessage(error.message || 'University student records are unavailable'); }
    finally { setStudentBusy(false); }
  }

  async function loadStudent(studentId) {
    setStudentBusy(true);
    setMessage('');
    try { setStudentDetail(await api.platformStudent(studentView.universityId, studentId)); }
    catch (error) { setStudentDetail(null); setMessage(error.message || 'Student details are unavailable'); }
    finally { setStudentBusy(false); }
  }

  return <div className="mx-auto max-w-7xl space-y-6 p-6 text-slate-900 dark:text-white">
    <header><h1 className="text-2xl font-bold">Universities</h1><p className="text-sm text-slate-500 dark:text-slate-400">One PeerPrep website and backend, with a separate database and Judge0 service for each university.</p></header>
    <section className={card} aria-label="How university access works">
      <h2 className="text-lg font-semibold">How the new flow works</h2>
      <ol className="mt-3 grid gap-3 text-sm md:grid-cols-4">
        <li><strong>1. Register</strong><p className="mt-1 text-slate-500 dark:text-slate-400">Add the university database, Judge0 endpoint and first admin here.</p></li>
        <li><strong>2. Give access</strong><p className="mt-1 text-slate-500 dark:text-slate-400">Choose modules and publish shared assessments for that university.</p></li>
        <li><strong>3. Create students</strong><p className="mt-1 text-slate-500 dark:text-slate-400">Its admins create students inside the university portal. Records stay in its database.</p></li>
        <li><strong>4. Take exams</strong><p className="mt-1 text-slate-500 dark:text-slate-400">Students sign in at peerprep.co.in/u/UNIVERSITY-ID/student.</p></li>
      </ol>
    </section>
    {message && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{message}</p>}

    <section className={card}><h2 className="text-lg font-semibold">Defaults for new universities</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">These settings apply when a university is created; changing one university does not change another. Learning can use the university or shared database. Published public questions are always included alongside university questions.</p>
      {defaults && <><div className="mt-4 flex flex-wrap gap-3">{visibleModules(defaults).map(([moduleName, label]) => <label key={moduleName} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={permissionOn(defaults.permissions, moduleName)} disabled={busy} onChange={(event) => act(() => api.updateUniversityDefaults({ permissions: { [moduleName]: event.target.checked } }))} />{label}</label>)}</div>
      <div className="mt-4 flex flex-wrap gap-4">{['learning'].map((source) => <label className="grid gap-1 text-sm capitalize" key={source}>{source} data source<select className={input} value={defaults.sources?.[source] || 'university'} disabled={busy} onChange={(event) => act(() => api.updateUniversityDefaults({ sources: { [source]: event.target.value } }))}><option value="university">University DB</option><option value="shared">Shared DB</option></select></label>)}</div>
      {supportsProgression(defaults) && <ProgressionEditor scopeLabel="the platform defaults" stored={defaults.progression} permissions={defaults.permissions} disabled={busy} onSave={(body) => api.updateUniversityDefaults(body)} onSaved={refresh} />}</>}
    </section>

    <form onSubmit={create} className={card}>
      <h2 className="text-lg font-semibold">Add university</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Test the MongoDB connection first. The test does not save or claim the database. Database and service credentials stay on the backend.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {[
          ['universityId', 'University ID'], ['name', 'Name'], ['contactEmail', 'Contact email'],
          ['dbUri', 'MongoDB URI'], ['judge0Url', 'Judge0 URL'],
          ['judge0AuthHeader', 'Judge0 auth header (optional)'], ['judge0AuthToken', 'Judge0 auth token (optional)'],
          ['adminEmail', 'University admin email'], ['adminPassword', 'Initial admin password (unused for an existing admin)'],
          ['interviewServiceUrl', 'AI interview service URL (optional)'], ['interviewServiceSecret', 'AI interview secret (optional)'],
        ].map(([field, label]) => <label key={field} className="grid gap-1 text-sm">{label}
          <input className={input} type={['adminPassword', 'dbUri', 'judge0AuthToken', 'interviewServiceSecret'].includes(field) ? 'password' : 'text'}
            autoComplete="off" value={newUniversity[field]} onChange={(event) => setNewUniversity({ ...newUniversity, [field]: event.target.value })}
            required={['universityId', 'name', 'dbUri', 'judge0Url', 'adminEmail', 'adminPassword'].includes(field)} />
        </label>)}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || !newUniversity.universityId || !newUniversity.dbUri || newDbTest?.status === 'testing'} className={button} onClick={testNewDatabase}>Test MongoDB connection</button>
        <button disabled={busy || newDbTest?.status !== 'success' || newDbTest.id !== newUniversity.universityId || newDbTest.uri !== newUniversity.dbUri} className={button}>Create university</button>
        {newDbTest?.id === newUniversity.universityId && newDbTest?.uri === newUniversity.dbUri && <span role="status" className={`text-sm ${newDbTest.status === 'error' ? 'text-rose-600' : newDbTest.status === 'success' ? 'text-emerald-600' : 'text-slate-500'}`}>{newDbTest.status === 'success' ? 'Connection verified. You can create the university.' : newDbTest.status === 'testing' ? 'Testing connection…' : newDbTest.message}</span>}
      </div>
    </form>

    <section className="space-y-3"><h2 className="text-lg font-semibold">Universities ({universities.length})</h2>{universities.map((university) => <div className={card} key={university.universityId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{university.name} <span className="text-xs text-slate-500 dark:text-slate-400">{university.universityId}</span></h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{university.contactEmail || 'No contact email'} · peerprep.co.in/u/{university.universityId}</p>
          <p className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className={university.dbConfigured ? 'text-emerald-600' : 'text-rose-600'}>{university.dbConfigured ? 'Database configured' : 'Database missing'}</span>
            <span className={university.judgeConfigured ? 'text-emerald-600' : 'text-rose-600'}>{university.judgeConfigured ? 'Judge0 configured' : 'Judge0 missing'}</span>
            <span>{university.active ? 'Active' : 'Disabled'}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || studentBusy} className={button} onClick={() => { setStudentSearch(''); loadStudents(university.universityId, 1, ''); }}>View students</button>
          <button disabled={busy} className={button} onClick={() => act(() => api.updateUniversity(university.universityId, { active: !university.active }))}>{university.active ? 'Disable' : 'Enable'}</button>
          <button disabled={busy} className={button} onClick={() => act(() => api.updateUniversityDefaults(defaultsFrom(university)))}>Use as new default</button>
          <button disabled={busy} className="rounded-lg border border-rose-500 px-4 py-2 text-sm font-semibold text-rose-600 disabled:opacity-50" onClick={() => deleteUniversity(university)}>Delete</button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <a className="text-sm text-sky-600 underline md:col-span-2" href={`/u/${university.universityId}/student`}>Open {university.name} on PeerPrep</a>
        <label className="grid gap-1 text-sm">Replace MongoDB URI <input className={input} type="password" autoComplete="off" placeholder={university.dbConfigured ? 'Configured; enter a new URI to replace' : 'MongoDB URI required'} value={connections[university.universityId]?.dbUri || ''} onChange={(event) => setConnections((previous) => ({ ...previous, [university.universityId]: { ...previous[university.universityId], dbUri: event.target.value } }))} /></label>
        <div className="flex flex-wrap items-center gap-2"><button type="button" className={button} disabled={busy || !connections[university.universityId]?.dbUri || dbTests[university.universityId]?.status === 'testing'} onClick={() => testExistingDatabase(university.universityId)}>Test MongoDB connection</button>{dbTests[university.universityId] && dbTests[university.universityId]?.uri === connections[university.universityId]?.dbUri && <span role="status" className={`text-sm ${dbTests[university.universityId]?.status === 'error' ? 'text-rose-600' : dbTests[university.universityId]?.status === 'success' ? 'text-emerald-600' : 'text-slate-500'}`}>{dbTests[university.universityId]?.status === 'success' ? 'Connection verified' : dbTests[university.universityId]?.status === 'testing' ? 'Testing connection…' : dbTests[university.universityId]?.message}</span>}</div>
        <label className="grid gap-1 text-sm">Replace Judge0 URL <input className={input} type="url" autoComplete="off" placeholder={university.judgeConfigured ? 'Configured; enter a new URL to replace' : 'Judge0 URL required'} value={connections[university.universityId]?.judge0Url || ''} onChange={(event) => setConnections((previous) => ({ ...previous, [university.universityId]: { ...previous[university.universityId], judge0Url: event.target.value } }))} /></label>
        <label className="grid gap-1 text-sm">Judge0 auth header <input className={input} placeholder={university.judgeAuthConfigured ? 'Configured; enter header and token to replace' : 'Optional header name'} value={connections[university.universityId]?.judge0AuthHeader || ''} onChange={(event) => setConnections((previous) => ({ ...previous, [university.universityId]: { ...previous[university.universityId], judge0AuthHeader: event.target.value } }))} /></label>
        <label className="grid gap-1 text-sm">Judge0 auth token <input className={input} type="password" autoComplete="off" placeholder={university.judgeAuthConfigured ? 'Configured; enter header and token to replace' : 'Optional token'} value={connections[university.universityId]?.judge0AuthToken || ''} onChange={(event) => setConnections((previous) => ({ ...previous, [university.universityId]: { ...previous[university.universityId], judge0AuthToken: event.target.value } }))} /></label>
        <label className="grid gap-1 text-sm">AI interview service URL <input className={input} type="url" autoComplete="off" placeholder={university.interviewConfigured ? 'Configured; enter URL and secret to replace' : 'Optional service URL'} value={connections[university.universityId]?.interviewServiceUrl || ''} onChange={(event) => setConnections((previous) => ({ ...previous, [university.universityId]: { ...previous[university.universityId], interviewServiceUrl: event.target.value } }))} /></label>
        <label className="grid gap-1 text-sm">AI interview secret <input className={input} type="password" autoComplete="off" placeholder={university.interviewConfigured ? 'Configured; enter URL and secret to replace' : 'Optional service secret'} value={connections[university.universityId]?.interviewServiceSecret || ''} onChange={(event) => setConnections((previous) => ({ ...previous, [university.universityId]: { ...previous[university.universityId], interviewServiceSecret: event.target.value } }))} /></label>
        <button className={button} disabled={busy || !Object.values(connections[university.universityId] || {}).some(Boolean) || (Boolean(connections[university.universityId]?.dbUri) && (dbTests[university.universityId]?.status !== 'success' || dbTests[university.universityId]?.uri !== connections[university.universityId]?.dbUri))} onClick={() => act(async () => { await api.updateUniversity(university.universityId, connections[university.universityId]); setConnections((previous) => ({ ...previous, [university.universityId]: {} })); setDbTests((previous) => ({ ...previous, [university.universityId]: null })); })}>Save connection settings</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">{visibleModules(defaults).map(([moduleName, label]) => <label key={moduleName} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={permissionOn(university.permissions, moduleName)} disabled={busy} onChange={(event) => act(() => api.updateUniversity(university.universityId, { permissions: { [moduleName]: event.target.checked } }))} />{label}</label>)}</div>
      <div className="mt-4 flex flex-wrap gap-4">{['learning'].map((source) => <label className="grid gap-1 text-sm capitalize" key={source}>{source} data source<select className={input} value={university.sources?.[source] || 'university'} disabled={busy} onChange={(event) => act(() => api.updateUniversity(university.universityId, { sources: { [source]: event.target.value } }))}><option value="university">University DB</option><option value="shared">Shared DB</option></select></label>)}</div>
      {supportsProgression(defaults) && <ProgressionEditor scopeLabel={university.name} stored={university.progression} permissions={university.permissions} disabled={busy} resetSource={defaults?.progression} onSave={(body) => api.updateUniversity(university.universityId, body)} onSaved={refresh} />}
    </div>)}</section>

    {studentView && <section className={card}><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Students · {studentView.universityId}</h2><button className="text-sm underline" onClick={() => { setStudentView(null); setStudentDetail(null); }}>Close</button></div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Read-only data from this university database.</p><form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); loadStudents(studentView.universityId, 1); }}><input className={input} aria-label="Search students" placeholder="Name, student ID or email" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} /><button className={button} disabled={studentBusy}>Search</button></form><p className="mt-3 text-sm">{studentView.total} student{studentView.total === 1 ? '' : 's'}</p><div className="mt-2 max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Name</th><th className="p-2">Student ID</th><th className="p-2">Course</th><th className="p-2">Status</th><th className="p-2"></th></tr></thead><tbody>{studentView.students.map((student) => <tr className="border-t border-slate-200 dark:border-slate-700" key={student._id}><td className="p-2">{student.name || student.email}</td><td className="p-2">{student.studentId || '—'}</td><td className="p-2">{student.course || '—'}</td><td className="p-2">{student.isActive ? 'Active' : 'Inactive'}</td><td className="p-2"><button className="text-sky-600 underline" disabled={studentBusy} onClick={() => loadStudent(student._id)}>Details</button></td></tr>)}</tbody></table></div><div className="mt-3 flex gap-3"><button className="text-sm underline disabled:opacity-40" disabled={studentBusy || studentView.page <= 1} onClick={() => loadStudents(studentView.universityId, studentView.page - 1)}>Previous</button><span className="text-sm">Page {studentView.page}</span><button className="text-sm underline disabled:opacity-40" disabled={studentBusy || studentView.page * studentView.pageSize >= studentView.total} onClick={() => loadStudents(studentView.universityId, studentView.page + 1)}>Next</button></div>{studentDetail && <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700"><h3 className="font-semibold">{studentDetail.student.name || studentDetail.student.studentId}</h3><p className="text-sm text-slate-500 dark:text-slate-400">{studentDetail.student.studentId || 'No student ID'} · {studentDetail.student.email || 'No email'} · {studentDetail.student.course || 'No course'} · {studentDetail.student.branch || 'No branch'} · Semester {studentDetail.student.semester || '—'}</p><h4 className="mt-3 font-medium">Assessment results</h4>{studentDetail.assessments.length ? studentDetail.assessments.map((row) => <p className="mt-1 text-sm" key={row._id}>{row.title} · {row.status} · {row.score == null ? 'No score yet' : `${row.score}/${row.maxMarks ?? '—'}`}</p>) : <p className="text-sm text-slate-500 dark:text-slate-400">No assessment submissions</p>}<h4 className="mt-3 font-medium">AI interview status</h4>{studentDetail.interviewSessions.length ? studentDetail.interviewSessions.map((row) => <p className="mt-1 text-sm" key={row._id}>{row.status || 'Status unavailable'} · {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : 'No update time'}</p>) : <p className="text-sm text-slate-500 dark:text-slate-400">No interview sessions found</p>}</div>}</section>}

    <section className="space-y-3"><h2 className="text-lg font-semibold">Assign shared assessments</h2><p className="text-sm text-slate-500 dark:text-slate-400">Public, published questions are shared automatically. Private questions stay in the main admin library and can be used in assigned assessments.</p><div className={card}><div className="max-h-96 space-y-2 overflow-y-auto">{(catalog?.assessments || []).map((row) => {
      const kind = 'assessment';
      const key = `${kind}:${row._id}`;
      const publication = publicationFor(kind, row._id);
      const selected = assignments[key] || [];
      return <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700" key={key}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{row.title || String(row._id)}</span><div className="flex gap-2"><button className={button} disabled={busy} onClick={() => act(() => api.publishPlatformContent(kind, row._id, { published: true, universityIds: selected }))}>Save access</button><button className={button} disabled={busy} onClick={() => act(() => api.publishPlatformContent(kind, row._id, { published: false, universityIds: selected }))}>Hide</button></div></div><div className="mt-2 flex flex-wrap gap-3">{universities.map((university) => <label className="flex items-center gap-1 text-xs" key={university.universityId}><input type="checkbox" checked={selected.includes(university.universityId)} onChange={(event) => setAssignments((previous) => ({ ...previous, [key]: event.target.checked ? [...selected, university.universityId] : selected.filter((id) => id !== university.universityId) }))} />{university.name}</label>)}</div><span className="text-xs text-emerald-600">{publication?.published ? 'Published to selected universities' : 'Hidden'}</span></div>;
    })}</div></div></section>
    <section className={card}><h2 className="mb-3 font-semibold">Platform audit log</h2><div className="max-h-64 overflow-auto text-xs">{(overview?.audit || []).map((row) => <p className="border-b py-2" key={row._id}>{new Date(row.createdAt).toLocaleString()} · {row.action} · {row.universityId}</p>)}</div></section>
  </div>;
}
