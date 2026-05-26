const footerSections = [
  {
    title: 'Platform',
    links: [
      { label: 'Assessments', href: '/student/assessments' },
      { label: 'Compiler', href: '/problems' },
      { label: 'Learning', href: '/student/learning' },
      { label: 'Reports', href: '/student/assessment-reports' },
    ],
  },
  {
    title: 'Operations',
    links: [
      { label: 'Mock Interviews', href: '/student/interview' },
      { label: 'Coordinator Access', href: '/admin/coordinator-access' },
      { label: 'Student Management', href: '/admin/students' },
      { label: 'Student Analytics', href: '/student/analytics' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Help & Support', href: '/student/help' },
      { label: 'Contact', href: '/contact' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="w-full border-t border-slate-200 bg-white text-slate-700 shadow-sm dark:border-white/10 dark:bg-gray-950 dark:text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_2fr] lg:items-start">
          <div className="max-w-md">
            <img
              src="/images/logo.png"
              alt="PeerPrep Logo"
              className="h-20 w-auto object-contain"
            />
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
              PeerPrep brings assessments, coding practice, interview scheduling, coordinator access control, learning modules, and analytics into one placement-ready platform.
            </p>
            <p className="mt-3 text-xs leading-5 text-slate-400 dark:text-slate-500">
              Platform developed by Anubhav Dhyani and Vivek Semwal.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {footerSections.map((section) => (
              <div key={section.title}>
                <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  {section.title}
                </h2>
                <div className="mt-3 space-y-2">
                  {section.links.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      className="block text-sm font-semibold text-slate-600 transition-colors hover:text-sky-600 dark:text-slate-300 dark:hover:text-sky-300"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-5 text-xs font-medium text-slate-400 dark:border-white/10 dark:text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>&copy; {new Date().getFullYear()} PeerPrep. All rights reserved.</span>
          <span>Built for students, coordinators, and administrators.</span>
        </div>
      </div>
    </footer>
  );
}
