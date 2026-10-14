import assert from 'node:assert/strict';
import test from 'node:test';
import {deriveCatMouseExpected,validateCatMouseFixture} from '../src/services/catMouseGameOracleService.js';

const problem={_id:'6ace18716ca3216598beea8a',title:'Cat and Mouse II',executionMode:'function',functionContract:{className:'Solution',methodName:'canMouseWin',parameters:[{name:'grid',type:'string[]'},{name:'catJump',type:'integer'},{name:'mouseJump',type:'integer'}],returnType:'boolean'}};
test('bounded oracle reproduces canonical examples',()=>{assert.equal(deriveCatMouseExpected(problem,'grid = ["####F","#C...","M...."], catJump = 1, mouseJump = 2'),true);assert.equal(deriveCatMouseExpected(problem,'grid = ["M.C...F"], catJump = 1, mouseJump = 3'),false);});
test('jump roles, walls, and first-move race affect the exact result',()=>{assert.equal(deriveCatMouseExpected(problem,'grid = ["M..",".#F","C.."], catJump = 1, mouseJump = 2'),true);assert.equal(deriveCatMouseExpected(problem,'grid = ["M..",".#F","C.."], catJump = 3, mouseJump = 1'),false);assert.equal(deriveCatMouseExpected(problem,'grid = ["MCF"], catJump = 1, mouseJump = 2'),true);});
test('fixture gate rejects malformed boards and non-leaf contract drift',()=>{assert.throws(()=>validateCatMouseFixture(problem,'grid = ["MMF"], catJump = 1, mouseJump = 1'));assert.throws(()=>validateCatMouseFixture(problem,'grid = ["M#F","C"], catJump = 1, mouseJump = 1'));});
