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
  const [newUniversity, setNewUniversity] = useState({ universityId: '', name: '', contactEmail: '', deploymentUrl: '', apiUrl: '' });
  const [issuedKey, setIssuedKey] = useState(null);
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
    await act(async () => {
      const result = await api.createUniversity(newUniversity);
      setIssuedKey({ universityId: result.university.universityId, value: result.apiKey });
      setNewUniversity({ universityId: '', name: '', contactEmail: '', deploymentUrl: '', apiUrl: '' });
    });
  }

  const universities = overview?.universities || [];
  const defaults = overview?.defaults;
  const publicationFor = (kind, id) => catalog?.publications.find((item) => item.kind === kind && String(item.contentId) === String(id));

  function deleteUniversity(university) {
    if (!window.confirm(`Delete ${university.name} (${university.universityId}) from the central database? Its API key and shared assessment access will be revoked, and this ID can be used again. Its VPS database will remain intact.`)) return;
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
    <header><h1 className="text-2xl font-bold">University control plane</h1><p className="text-sm text-slate-500 dark:text-slate-400">Manage deployments, access and shared content.</p></header>
    {message && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{message}</p>}
    {issuedKey && <div className={`${card} border-amber-400`}><h2 className="font-bold">Save this API key now</h2><p className="text-sm">Set PEERPREP_SHARED_API_KEY on {issuedKey.universityId}. It will not be shown again.</p><code className="mt-2 block break-all rounded bg-slate-100 p-3 text-sm dark:bg-slate-800">{issuedKey.value}</code><button className="mt-3 text-sm underline" onClick={() => setIssuedKey(null)}>I saved the key</button></div>}

    <section className={card}><h2 className="text-lg font-semibold">Defaults for new universities</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">These settings apply when a university is created; changing one university does not change another. Learning can use the university or shared database. Published public questions are always included alongside university questions.</p>
      {defaults && <><div className="mt-4 flex flex-wrap gap-3">{visibleModules(defaults).map(([moduleName, label]) => <label key={moduleName} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={permissionOn(defaults.permissions, moduleName)} disabled={busy} onChange={(event) => act(() => api.updateUniversityDefaults({ permissions: { [moduleName]: event.target.checked } }))} />{label}</label>)}</div>
      <div className="mt-4 flex flex-wrap gap-4">{['learning'].map((source) => <label className="grid gap-1 text-sm capitalize" key={source}>{source} data source<select className={input} value={defaults.sources?.[source] || 'university'} disabled={busy} onChange={(event) => act(() => api.updateUniversityDefaults({ sources: { [source]: event.target.value } }))}><option value="university">University DB</option><option value="shared">Shared DB</option></select></label>)}</div>
      {supportsProgression(defaults) && <ProgressionEditor scopeLabel="the platform defaults" stored={defaults.progression} permissions={defaults.permissions} disabled={busy} onSave={(body) => api.updateUniversityDefaults(body)} onSaved={refresh} />}</>}
    </section>

    <form onSubmit={create} className={card}><h2 className="mb-4 text-lg font-semibold">Add university</h2><p className="mb-4 text-sm text-slate-500 dark:text-slate-400">The new university will inherit the defaults above and use its own MongoDB connection for local data.</p><div className="grid gap-3 md:grid-cols-4">
      {[['universityId', 'University ID'], ['name', 'Name'], ['contactEmail', 'Contact email'], ['deploymentUrl', 'Frontend URL'], ['apiUrl', 'University API URL']].map(([field, label]) => <label key={field} className="grid gap-1 text-sm">{label}<input className={input} value={newUniversity[field]} onChange={(event) => setNewUniversity({ ...newUniversity, [field]: event.target.value })} required={field === 'universityId' || field === 'name'} /></label>)}
    </div><button disabled={busy} className={`${button} mt-4`}>Create university</button></form>

    <section className="space-y-3"><h2 className="text-lg font-semibold">Universities ({universities.length})</h2>{universities.map((university) => <div className={card} key={university.universityId}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{university.name} <span className="text-xs text-slate-500 dark:text-slate-400">{university.universityId}</span></h3><p className="text-xs text-slate-500 dark:text-slate-400">{university.contactEmail || 'No contact email'} · {university.deploymentUrl || 'No deployment URL'}</p><p className="text-xs text-slate-500 dark:text-slate-400">Last heartbeat: {university.lastHeartbeatAt ? new Date(university.lastHeartbeatAt).toLocaleString() : 'Never'} · Students: {university.usage?.students ?? 0} · Coordinators: {university.usage?.coordinators ?? 0} · Submissions: {university.usage?.submissions ?? 0} · AI interviews: {university.usage?.interviewSessions ?? 0}</p><label className="mt-2 flex items-center gap-2 text-xs">University API URL <input className={input} type="url" defaultValue={university.apiUrl || ''} key={university.apiUrl || ''} placeholder="https://api.university.example" onBlur={(event) => { if (event.target.value !== (university.apiUrl || '')) act(() => api.updateUniversity(university.universityId, { apiUrl: event.target.value })); }} /></label></div><div className="flex flex-wrap gap-2"><button disabled={busy || studentBusy} className={button} onClick={() => { setStudentSearch(''); loadStudents(university.universityId, 1, ''); }}>View students</button><button disabled={busy} className={button} onClick={() => act(() => api.rotateUniversityKey(university.universityId).then((result) => setIssuedKey({ universityId: university.universityId, value: result.apiKey })))}>Rotate key</button><button disabled={busy} className={button} onClick={() => act(() => api.updateUniversity(university.universityId, { active: !university.active }))}>{university.active ? 'Disable' : 'Enable'}</button><button disabled={busy} className={button} onClick={() => act(() => api.updateUniversityDefaults(defaultsFrom(university)))}>Use as new default</button><button disabled={busy} className="rounded-lg border border-rose-500 px-4 py-2 text-sm font-semibold text-rose-600 disabled:opacity-50" onClick={() => deleteUniversity(university)}>Delete</button></div></div>
      <div className="mt-4 flex flex-wrap gap-3">{visibleModules(defaults).map(([moduleName, label]) => <label key={moduleName} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={permissionOn(university.permissions, moduleName)} disabled={busy} onChange={(event) => act(() => api.updateUniversity(university.universityId, { permissions: { [moduleName]: event.target.checked } }))} />{label}</label>)}</div>
      <div className="mt-4 flex flex-wrap gap-4">{['learning'].map((source) => <label className="grid gap-1 text-sm capitalize" key={source}>{source} data source<select className={input} value={university.sources?.[source] || 'university'} disabled={busy} onChange={(event) => act(() => api.updateUniversity(university.universityId, { sources: { [source]: event.target.value } }))}><option value="university">University DB</option><option value="shared">Shared DB</option></select></label>)}</div>
      {supportsProgression(defaults) && <ProgressionEditor scopeLabel={university.name} stored={university.progression} permissions={university.permissions} disabled={busy} resetSource={defaults?.progression} onSave={(body) => api.updateUniversity(university.universityId, body)} onSaved={refresh} />}
    </div>)}</section>

    {studentView && <section className={card}><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Students · {studentView.universityId}</h2><button className="text-sm underline" onClick={() => { setStudentView(null); setStudentDetail(null); }}>Close</button></div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Read-only data from the university API. Last reported count stays above if its VPS is offline.</p><form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); loadStudents(studentView.universityId, 1); }}><input className={input} aria-label="Search students" placeholder="Name, student ID or email" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} /><button className={button} disabled={studentBusy}>Search</button></form><p className="mt-3 text-sm">{studentView.total} student{studentView.total === 1 ? '' : 's'}</p><div className="mt-2 max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Name</th><th className="p-2">Student ID</th><th className="p-2">Course</th><th className="p-2">Status</th><th className="p-2"></th></tr></thead><tbody>{studentView.students.map((student) => <tr className="border-t border-slate-200 dark:border-slate-700" key={student._id}><td className="p-2">{student.name || student.email}</td><td className="p-2">{student.studentId || '—'}</td><td className="p-2">{student.course || '—'}</td><td className="p-2">{student.isActive ? 'Active' : 'Inactive'}</td><td className="p-2"><button className="text-sky-600 underline" disabled={studentBusy} onClick={() => loadStudent(student._id)}>Details</button></td></tr>)}</tbody></table></div><div className="mt-3 flex gap-3"><button className="text-sm underline disabled:opacity-40" disabled={studentBusy || studentView.page <= 1} onClick={() => loadStudents(studentView.universityId, studentView.page - 1)}>Previous</button><span className="text-sm">Page {studentView.page}</span><button className="text-sm underline disabled:opacity-40" disabled={studentBusy || studentView.page * studentView.pageSize >= studentView.total} onClick={() => loadStudents(studentView.universityId, studentView.page + 1)}>Next</button></div>{studentDetail && <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700"><h3 className="font-semibold">{studentDetail.student.name || studentDetail.student.studentId}</h3><p className="text-sm text-slate-500 dark:text-slate-400">{studentDetail.student.studentId || 'No student ID'} · {studentDetail.student.email || 'No email'} · {studentDetail.student.course || 'No course'} · {studentDetail.student.branch || 'No branch'} · Semester {studentDetail.student.semester || '—'}</p><h4 className="mt-3 font-medium">Assessment results</h4>{studentDetail.assessments.length ? studentDetail.assessments.map((row) => <p className="mt-1 text-sm" key={row._id}>{row.title} · {row.status} · {row.score == null ? 'No score yet' : `${row.score}/${row.maxMarks ?? '—'}`}</p>) : <p className="text-sm text-slate-500 dark:text-slate-400">No assessment submissions</p>}<h4 className="mt-3 font-medium">AI interview status</h4>{studentDetail.interviewSessions.length ? studentDetail.interviewSessions.map((row) => <p className="mt-1 text-sm" key={row._id}>{row.status || 'Status unavailable'} · {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : 'No update time'}</p>) : <p className="text-sm text-slate-500 dark:text-slate-400">No interview sessions found</p>}</div>}</section>}

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
