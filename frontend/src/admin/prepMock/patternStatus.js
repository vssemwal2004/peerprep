const same = (left, right) => String(left || '').trim().toLocaleLowerCase() === String(right || '').trim().toLocaleLowerCase();

/** A selected pattern is ready only for the mock's current company and role. */
export function hasMockPatternForIdentity(form = {}) {
  return Boolean(form.patternId && form.mockPattern?.rows?.length
    && form.company && form.role
    && same(form.mockPattern.company, form.company)
    && same(form.mockPattern.role, form.role));
}
