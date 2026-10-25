import { useState } from 'react';
import { Bot, Code2, Database, PlugZap } from 'lucide-react';
import { api } from '../../../utils/api';
import { Button, Card, Field, Notice, Pill, inputClass } from '../ui';

const Status = ({ on, optional }) => <Pill tone={on ? 'success' : optional ? 'neutral' : 'danger'}>{on ? 'Connected' : optional ? 'Not connected' : 'Missing'}</Pill>;

/** Replace a university's secrets. Saved values are never shown again, only whether each is set. */
export default function ConnectionsTab({ university, run, busy }) {
  const id = university.universityId;
  const [dbUri, setDbUri] = useState('');
  const [dbTest, setDbTest] = useState(null);
  const [judge, setJudge] = useState({ judge0Url: '', judge0AuthHeader: '', judge0AuthToken: '' });
  const [ai, setAi] = useState({ interviewServiceUrl: '', interviewServiceSecret: '' });
  const tested = dbTest?.status === 'success' && dbTest.uri === dbUri;

  async function testDatabase() {
    const uri = dbUri;
    setDbTest({ uri, status: 'testing' });
    try { await api.testUniversityDatabase(id, uri); setDbTest({ uri, status: 'success' }); }
    catch (error) { setDbTest({ uri, status: 'error', message: error.message || 'The connection failed.' }); }
  }

  return (
    <div className="space-y-5">
      <Notice tone="info">Saved credentials stay encrypted on the server and are never shown. Enter a new value only to replace one.</Notice>

      <Card id="db-title" title="University database" icon={Database} actions={<Status on={university.dbConfigured} />} description="Changing the database moves this university to another MongoDB. Test it first.">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="New MongoDB URI" className="min-w-[18rem] flex-1"><input className={inputClass} type="password" autoComplete="off" value={dbUri} onChange={(event) => setDbUri(event.target.value)} placeholder="mongodb+srv://…" /></Field>
          <Button variant="secondary" icon={PlugZap} busy={dbTest?.status === 'testing'} disabled={!dbUri} onClick={testDatabase}>Test connection</Button>
          <Button busy={busy === 'db'} disabled={!tested} onClick={() => run('db', async () => { await api.updateUniversity(id, { dbUri }); setDbUri(''); setDbTest(null); }, 'Database connection replaced.')}>Save database</Button>
        </div>
        {dbTest?.uri === dbUri && dbTest.status === 'success' && <div className="mt-3"><Notice tone="success">Connection verified. Save to switch this university to it.</Notice></div>}
        {dbTest?.uri === dbUri && dbTest.status === 'error' && <div className="mt-3"><Notice tone="danger">{dbTest.message}</Notice></div>}
      </Card>

      <Card id="judge-title" title="Code judge (Judge0)" icon={Code2} actions={<span className="flex gap-2"><Status on={university.judgeConfigured} />{university.judgeAuthConfigured && <Pill tone="info">Auth set</Pill>}</span>} description="Runs students' code for practice and coding assessments.">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="New Judge0 URL"><input className={inputClass} type="url" value={judge.judge0Url} onChange={(event) => setJudge({ ...judge, judge0Url: event.target.value })} placeholder="https://judge.university.edu" /></Field>
          <Field label="Auth header" hint="Header and token go together"><input className={inputClass} value={judge.judge0AuthHeader} onChange={(event) => setJudge({ ...judge, judge0AuthHeader: event.target.value })} placeholder="X-Auth-Token" /></Field>
          <Field label="Auth token"><input className={inputClass} type="password" autoComplete="off" value={judge.judge0AuthToken} onChange={(event) => setJudge({ ...judge, judge0AuthToken: event.target.value })} /></Field>
        </div>
        <Button className="mt-4" busy={busy === 'judge'}
          disabled={!(judge.judge0Url || (judge.judge0AuthHeader && judge.judge0AuthToken)) || Boolean(judge.judge0AuthHeader) !== Boolean(judge.judge0AuthToken)}
          onClick={() => run('judge', async () => {
            await api.updateUniversity(id, Object.fromEntries(Object.entries(judge).filter(([, value]) => value)));
            setJudge({ judge0Url: '', judge0AuthHeader: '', judge0AuthToken: '' });
          }, 'Code judge settings saved.')}>Save code judge</Button>
      </Card>

      <Card id="ai-title" title="AI interview service" icon={Bot} actions={<Status on={university.interviewConfigured} optional />} description="Optional and no longer required. AI interviews with ANVI run on the backend and only need GEMINI_API_KEY set there.">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Service URL"><input className={inputClass} type="url" value={ai.interviewServiceUrl} onChange={(event) => setAi({ ...ai, interviewServiceUrl: event.target.value })} placeholder="https://interviews.university.edu" /></Field>
          <Field label="Service secret" hint="At least 32 characters"><input className={inputClass} type="password" autoComplete="off" value={ai.interviewServiceSecret} onChange={(event) => setAi({ ...ai, interviewServiceSecret: event.target.value })} /></Field>
        </div>
        <Button className="mt-4" busy={busy === 'ai'} disabled={!ai.interviewServiceUrl || ai.interviewServiceSecret.length < 32}
          onClick={() => run('ai', async () => { await api.updateUniversity(id, ai); setAi({ interviewServiceUrl: '', interviewServiceSecret: '' }); }, 'AI interview service saved.')}>Save AI interview service</Button>
      </Card>
    </div>
  );
}
