import React, { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation, useParams, useSearchParams } from 'react-router-dom';
import '../src/index.css';
import CompanyRail from '../src/student/prepMock/CompanyRail';
import MockNavigator from '../src/student/prepMock/MockNavigator';
import CompanyView from '../src/student/prepMock/CompanyView';
import { groupMocks, findCompany, pickMock } from '../src/student/prepMock/prepMockModel';

const q = new URLSearchParams(window.location.search);
if (q.get('dark') === '1') document.documentElement.classList.add('dark');
const now = Date.now();
const pattern = { patternFrom: { month: 3, year: 2025 }, rows: [{ name: 'Numerical Ability', type: 'mcq', questions: 20, minutes: 25, marks: 20 }, { name: 'Verbal Ability', type: 'mcq', questions: 25, minutes: 25, marks: 20 }, { name: 'Advance Coding', type: 'coding', questions: 3, minutes: 90, marks: 30 }] };
let n = 0;
const mock = (company, role, title, extra = {}) => ({ _id: `m${++n}`, title, company, role, status: 'Live', availabilityMode: 'always', startTime: new Date(now - 3600e3).toISOString(), endTime: '9999-12-31T23:59:59.000Z', duration: 120, totalMarks: 70, totalQuestions: 48, description: 'Full online assessment as asked in the 2025 campus drive.', sections: [{ sectionName: 'Numerical Ability', type: 'mcq', questionCount: 20 }], mockPattern: pattern, ...extra });
const mocks = [
  ...['SDE 1', 'SDE 2', 'Data Analyst', 'Support Engineer', 'Cloud Engineer', 'Product Analyst'].flatMap((role, r) => Array.from({ length: r === 0 ? 7 : 2 + (r % 3) }, (_, i) => mock('Microsoft', role, `Microsoft ${role} · Online Test ${i + 1}`))),
  mock('Amazon', 'SDE 1', 'Amazon SDE 1 · OA Round 1'),
  mock('TCS', 'Ninja', 'TCS Ninja · NQT Mock', { collegeAssignment: { startTime: null, endTime: new Date(now + 5 * 864e5).toISOString() } }),
];
const companies = groupMocks(mocks);
const reports = new Map();

function Page() {
  const { company: param } = useParams();
  const { key: locationKey } = useLocation();
  const [params, setParams] = useSearchParams();
  const roleParam = params.get('role');
  const mockParam = params.get('mock');
  const company = findCompany(companies, param);
  const { role, mock } = pickMock(company, roleParam, mockParam);
  const patternHeadingRef = useRef(null);
  const [navigatorOverride, setNavigatorOverride] = useState(() => q.has('nav') ? { key: locationKey, open: q.get('nav') !== '0' } : null);
  const open = navigatorOverride?.key === locationKey ? navigatorOverride.open : !roleParam && !mockParam;
  const openNavigator = () => setNavigatorOverride({ key: locationKey, open: true });
  const closeNavigator = useCallback(() => setNavigatorOverride({ key: locationKey, open: false }), [locationKey]);
  const choose = (nextRole, nextMock) => {
    const updated = new URLSearchParams(params);
    updated.set('role', nextRole.name);
    if (nextMock) updated.set('mock', String(nextMock._id)); else updated.delete('mock');
    setParams(updated, { replace: true });
  };
  const selectRole = (nextRole) => choose(nextRole, nextRole.key === role?.key ? mock : null);
  if (!company) return null;

  return (
    <div className="min-h-screen bg-[#f6f7f9] font-dmsans text-slate-900 dark:bg-[#1a1a1a] dark:text-zinc-100">
      <div className="mx-auto max-w-[1480px] px-4 py-4 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="relative hidden lg:flex lg:flex-col lg:sticky lg:top-4">
            <CompanyRail companies={companies} selectedKey={company.key} selectedRoleKey={role?.key}
              onCompanyClick={(event, key) => {
                if (key !== company.key || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                event.preventDefault();
                openNavigator();
              }} />
            {open && (
              <div className="absolute left-full top-0 z-40 ml-3 hidden lg:block">
                <MockNavigator key={locationKey} onClose={closeNavigator} company={company} selectedRole={role} onSelectRole={(nextRole) => {
                  closeNavigator();
                  selectRole(nextRole);
                  requestAnimationFrame(() => patternHeadingRef.current?.focus());
                }} />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <CompanyView company={company} role={role} mock={mock} reports={reports} patternHeadingRef={patternHeadingRef}
              navigatorOpen={open} onOpenNavigator={openNavigator} onSelectRole={selectRole} onSelectMock={choose}
              onStart={() => {}} onViewResult={() => {}} onFeedback={() => {}} />
          </div>
        </div>
      </div>
    </div>
  );
}
const selection = new URLSearchParams();
for (const key of ['role', 'mock']) {
  const value = q.get(key);
  if (value) selection.set(key, value);
}
const path = `/student/prep-mock/microsoft${selection.size ? `?${selection}` : ''}`;
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/student/prep-mock/:company" element={<Page />} /></Routes></MemoryRouter>);
