import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAssessmentCompilerStudent } from '../src/middleware/auth.js';
import { assessmentIncludesProblem, assessmentProblemCandidates, assessmentSectionsForProblemAccess } from '../src/services/compilerExecutionWorkflowService.js';

function invoke(user, body = {}, query = {}) {
  let continued = false;
  let error = null;
  try {
    requireAssessmentCompilerStudent({ user, body, query }, {}, () => { continued = true; });
  } catch (caught) {
    error = caught;
  }
  return { continued, error };
}

test('assessment-only students can execute code when an assessment context is supplied', () => {
  const result = invoke(
    { role: 'student', accessScope: 'assessment_only' },
    { assessmentId: '6ab282d167ad76a19eb738c8', problemId: '6ab282d167ad76a19eb7000' },
  );
  assert.equal(result.continued, true);
  assert.equal(result.error, null);
});

test('assessment-only students cannot use the standalone compiler', () => {
  const result = invoke({ role: 'student', accessScope: 'assessment_only' });
  assert.equal(result.continued, false);
  assert.equal(result.error?.status, 403);
});

test('full students retain standalone compiler access', () => {
  const result = invoke({ role: 'student', accessScope: 'full' });
  assert.equal(result.continued, true);
  assert.equal(result.error, null);
});

test('compiler authorization uses the candidate assigned question set', () => {
  const studentId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const setOneProblem = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  const setTwoProblem = 'cccccccccccccccccccccccc';
  const assessment = {
    settings: { questionSetEnabled: true },
    sections: [{ type: 'coding', questions: [{ problemId: setOneProblem }] }],
    questionSets: [
      { setNumber: 1, sections: [{ type: 'coding', questions: [{ problemId: setOneProblem }] }] },
      { setNumber: 2, sections: [{ type: 'coding', questions: [{ problemId: setTwoProblem }] }] },
    ],
    candidateSetAssignments: [{ student: studentId, setNumber: 2 }],
  };

  assert.equal(assessmentIncludesProblem(assessment, setTwoProblem, { studentId }), true);
  assert.equal(assessmentIncludesProblem(assessment, setOneProblem, { studentId }), false);
  assert.equal(assessmentSectionsForProblemAccess(assessment, studentId)[0].questions[0].problemId, setTwoProblem);
});

test('persisted delivery restricts execution to questions actually shown to the student', () => {
  const selectedProblem = 'dddddddddddddddddddddddd';
  const unselectedProblem = 'eeeeeeeeeeeeeeeeeeeeeeee';
  const assessment = {
    settings: { questionSetEnabled: false },
    sections: [{ type: 'coding', questions: [{ problemId: selectedProblem }, { problemId: unselectedProblem }] }],
  };
  const delivered = [{ type: 'coding', questions: [{ problemId: selectedProblem }] }];

  assert.equal(assessmentIncludesProblem(assessment, selectedProblem, { deliverySections: delivered }), true);
  assert.equal(assessmentIncludesProblem(assessment, unselectedProblem, { deliverySections: delivered }), false);
});

test('legacy missing clone references expose only fallback IDs frozen on the delivered question', () => {
  const missingClone = '111111111111111111111111';
  const sourceProblem = '222222222222222222222222';
  const unrelatedProblem = '333333333333333333333333';
  const assessment = {
    sections: [{ type: 'coding', questions: [{
      problemId: missingClone,
      problemDataSnapshot: {
        _id: missingClone,
        assessmentSourceProblemId: sourceProblem,
      },
    }] }],
  };

  assert.deepEqual(assessmentProblemCandidates(assessment, missingClone), [missingClone, sourceProblem]);
  assert.equal(assessmentIncludesProblem(assessment, unrelatedProblem), false);
});
