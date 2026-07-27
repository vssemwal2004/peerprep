import { Link } from "react-router-dom";

const footerLinks = [
  {
    title: "Platform",
    links: [
      { label: "Home", href: "/#home" },
      { label: "Coding Practice", href: "/#coding-practice" },
      { label: "Mock Interviews", href: "/#mock-interviews" },
      { label: "Learning Module", href: "/#learning-module" },
      { label: "Recruiters", href: "/#recruiters" },
    ],
  },
  {
    title: "Student Area",
    links: [
      { label: "Student Login", href: "/student" },
      { label: "Problems", href: "/problems" },
      { label: "Assessments", href: "/assessments" },
      { label: "Reports", href: "/assessment-reports" },
      { label: "Help & Support", href: "/student/help" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "FAQ", href: "/#faq" },
      { label: "Contact Us", href: "/contact" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms & Conditions", href: "/terms" },
    ],
  },
];

function FooterLink({ href, children }) {
  if (href.startsWith("/#")) {
    return (
      <a href={href} className="text-sm font-medium text-sky-100/70 transition hover:text-white">
        {children}
      </a>
    );
  }

  return (
    <Link to={href} className="text-sm font-medium text-sky-100/70 transition hover:text-white">
      {children}
    </Link>
  );
}

export default function FooterSection() {
  return (
    <footer className="bg-[#082747] text-white" aria-label="PeerPrep footer">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <div className="flex items-center gap-3">
              <img src="/images/logo.png" alt="PeerPrep logo" width="48" height="48" className="h-12 w-12 object-contain" />
              <div>
                <p className="text-xl font-extrabold tracking-tight">PeerPrep</p>
                <p className="text-sm font-medium text-sky-100/75">AI-powered placement preparation platform</p>
              </div>
            </div>
            <p className="mt-5 max-w-md text-sm font-medium leading-6 text-sky-100/75">
              Practice coding problems, take assessments, follow semester-wise learning modules, and prepare for
              interviews through focused peer practice.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {footerLinks.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-sky-200">{group.title}</h3>
                <ul className="mt-4 space-y-3">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <FooterLink href={link.href}>{link.label}</FooterLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-5 text-xs font-light text-sky-100/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} PeerPrep. All rights reserved.</p>
          <p>Developed by Anubhav and Vivek</p>
        </div>
      </div>
    </footer>
  );
}
