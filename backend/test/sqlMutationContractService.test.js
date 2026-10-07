import test from 'node:test';
import assert from 'node:assert/strict';
import { sqlStatementKinds, validateSqlMutationContract } from '../src/services/sqlMutationContractService.js';
test('mutation contracts recognize comments, escaped quotes and embedded semicolons',()=>{
  assert.deepEqual(sqlStatementKinds("-- SELECT 1;\n UPDATE T SET name='a;it''s'; /* DELETE x; */"),['update']);
  assert.deepEqual(sqlStatementKinds('DELETE FROM [select;data] WHERE "delete;column" = `update;x`;'),['delete']);
  assert.doesNotThrow(()=>validateSqlMutationContract("UPDATE T SET name='SELECT;';",'update'));
  assert.doesNotThrow(()=>validateSqlMutationContract('DELETE FROM T;','delete'));
  assert.throws(()=>validateSqlMutationContract('DELETE FROM T; UPDATE T SET x=1;','delete'),/exactly one DELETE/);
  assert.throws(()=>validateSqlMutationContract('-- UPDATE T;\nSELECT 1;','update'),/exactly one UPDATE/);
});
