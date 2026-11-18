import { ArrowUpRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { focusRing } from "./ui";

export function StudentProfileLink({ studentId }) {
  const { pathname } = useLocation();
  const prefix = pathname.startsWith("/coordinator/") ? "/coordinator" : "/admin";
  return (
    <Link to={`${prefix}/students/${encodeURIComponent(studentId)}`}
      className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-sky-700 ${focusRing}`}>
      View profile <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

const FIELDS = [
  ["studentId", "Student ID"], ["course", "Course"], ["branch", "Branch"],
  ["college", "College"], ["semester", "Semester"], ["section", "Section"], ["group", "Group"], ["email", "Email"],
];

export function StudentIdentity({ student }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      {FIELDS.map(([key, label]) => (
        <div key={key} className={key === "email" ? "col-span-2 min-w-0" : "min-w-0"}>
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
          <dd className="mt-0.5 break-words text-[13px] font-semibold text-slate-800 dark:text-slate-100">
            {student?.[key] || <span aria-label="Not provided" className="font-normal text-slate-400">—</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
