import { positiveInteger } from '../utils/valkey.js';

export function createAssessmentAdmission({ workLimit = 48, finalLimit = 32 } = {}) {
  const active = { work: 0, final: 0 };
  // Wrap the complete known async/synchronous route chain, including auth.
  // Socket close/HTTP timeout is not cancellation of a Mongo operation.
  return (handlers, { group = 'work' } = {}) => {
    const chain = Array.isArray(handlers) ? handlers : [handlers];
    if (!['work', 'final'].includes(group) || !chain.length || chain.some((handler) => typeof handler !== 'function')) {
      throw new TypeError('Assessment admission requires handlers and a work/final group');
    }
    return async (req, res, next) => {
      const limit = group === 'final' ? finalLimit : workLimit;
      if (active[group] >= limit) {
        res.set('Retry-After', '2');
        return res.status(503).json({ code: 'ASSESSMENT_BUSY', error: 'Assessment service is busy. Retry the same request; no answer batch was accepted by this response.' });
      }
      active[group] += 1;
      const run = async (index) => {
        if (index >= chain.length || req.aborted || res.destroyed) return;
        let continuation;
        let calledNext = false;
        let failure;
        try {
          await chain[index](req, res, (error) => {
            if (calledNext) throw new Error('Assessment handler called next more than once');
            calledNext = true;
            continuation = error ? Promise.reject(error) : run(index + 1);
            // Attach immediately; the middleware may itself await other work.
            continuation.catch(() => {});
            return continuation;
          });
        } catch (error) { failure = error; }
        // Even a middleware error must not release while its already-started
        // controller is still finishing an acknowledged or pending DB write.
        if (continuation) {
          try { await continuation; } catch (error) { failure ||= error; }
        }
        if (failure) throw failure;
      };
      try { await run(0); }
      catch (error) { next(error); }
      finally { active[group] -= 1; }
    };
  };
}

// No in-memory waiting queue: overload receives a bounded, retryable response.
// Final submissions have their own slots so telemetry cannot starve them.
export const assessmentAdmission = createAssessmentAdmission({
  workLimit: Math.min(512, positiveInteger(process.env.ASSESSMENT_API_INFLIGHT_LIMIT, 48)),
  finalLimit: Math.min(512, positiveInteger(process.env.ASSESSMENT_FINAL_INFLIGHT_LIMIT, 32)),
});
