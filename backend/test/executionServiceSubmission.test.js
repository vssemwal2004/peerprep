import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JUDGE0_URL = 'http://judge-a.test,http://judge-b.test';
process.env.JUDGE0_POLL_INTERVAL_MS = '1';
const { runJudge0, evaluateSubmissionResult, buildJudge0Options } = await import('../src/services/executionService.js');

test('gates every submission failover and polls the node that issued the token', async () => {
  const originalFetch = globalThis.fetch;
  let permits = 0;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method, permits });
    if (options.method === 'POST' && url.startsWith('http://judge-a.test')) {
      return new Response(JSON.stringify({ message: 'busy' }), { status: 503 });
    }
    if (options.method === 'POST') {
      return new Response(JSON.stringify({ token: 'node-b-token', status: { id: 1 } }));
    }
    assert.ok(url.startsWith('http://judge-b.test/submissions/node-b-token'));
    return new Response(JSON.stringify({ status: { id: 3 }, stdout: Buffer.from('42').toString('base64') }));
  };
  try {
    const result = await runJudge0('print(42)', 71, '', {
      beforeSubmission: async () => { permits += 1; },
    });
    assert.equal(result.stdout, '42');
    assert.equal(permits, 2);
    assert.deepEqual(calls.map((call) => [call.method, call.permits]), [['POST', 1], ['POST', 2], ['GET', 2]]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('compiled languages use compatible targets and prepared runners retain room for fixtures', async () => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ status: { id: 3 } }));
  };
  try {
    await runJudge0(' '.repeat(60 * 1024), 54, '', { preparedFunctionRunner: true });
    await runJudge0('let value = 1;', 74);
    await runJudge0('#include <math.h>\nint main(){volatile double x=1;return atan2(x,x)<0;}', 50);
    assert.equal(bodies[0].compiler_options, '-std=c++17');
    assert.equal(bodies[1].compiler_options, '--target ES2019 --lib ESNext,DOM');
    assert.equal(bodies[2].compiler_options, '-std=gnu11 -Wl,--no-as-needed -lm');
    await assert.rejects(runJudge0(' '.repeat(60 * 1024), 54), /50 KB/);
    await assert.rejects(runJudge0(' '.repeat(257 * 1024), 54, '', { preparedFunctionRunner: true }), /256 KB/);
  } finally { globalThis.fetch = originalFetch; }
});

test('large integer answers compare exactly instead of rounding or relative tolerance', () => {
  const result = (stdout) => ({ status: { id: 3 }, stdout });
  assert.equal(evaluateSubmissionResult(result('999999999999999999'), '999999999999999998').internalStatus, 'WA');
  assert.equal(evaluateSubmissionResult(result('1000000000000000000'), '999999999999999999').internalStatus, 'WA');
  assert.equal(evaluateSubmissionResult(result('1e18'), '1000000000000000000').internalStatus, 'AC');
  assert.equal(evaluateSubmissionResult(result('3.000'), '3').internalStatus, 'AC');
  assert.equal(evaluateSubmissionResult(result('0.3333333333333333'), '0.3333333333').internalStatus, 'AC');
});

test('SQL mutation questions execute the submitted statement before checking the final table', async () => {
  const originalFetch=globalThis.fetch, sources=[];
  globalThis.fetch=async (_url,options)=>{sources.push(Buffer.from(JSON.parse(options.body).source_code,'base64').toString());return new Response(JSON.stringify({status:{id:3}}));};
  const options=buildJudge0Options({category:'SQL',sqlConfig:{schemaSql:'CREATE TABLE Salary(id INTEGER, sex TEXT);',requiredStatement:'update',resultQuery:'SELECT id,sex FROM Salary ORDER BY id;'}});
  try {
    await runJudge0("UPDATE Salary SET sex = CASE sex WHEN 'm' THEN 'f' ELSE 'm' END",82,"INSERT INTO Salary VALUES (1,'m');",options);
    assert.ok(sources[0].indexOf('CREATE TABLE')<sources[0].indexOf('INSERT INTO'));
    assert.ok(sources[0].indexOf('INSERT INTO')<sources[0].indexOf('UPDATE Salary'));
    assert.match(sources[0],/END\n;\nSELECT id,sex/);
    await assert.rejects(runJudge0('SELECT id,sex FROM Salary;',82,'',options),/exactly one UPDATE/);
    await assert.rejects(runJudge0('UPDATE Salary SET sex=\'f\'; SELECT 1;',82,'',options),/exactly one UPDATE/);
    assert.equal(sources.length,1);
  }finally{globalThis.fetch=originalFetch;}
});
