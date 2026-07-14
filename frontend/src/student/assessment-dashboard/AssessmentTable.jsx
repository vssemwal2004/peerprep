import { motion } from 'framer-motion';

export default function AssessmentTable({
  columns,
  rows,
  emptyTitle,
  emptyDescription,
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-5 py-4 text-left text-xs font-semibold text-slate-500 ${
                    column.align === 'right' ? 'text-right' : ''
                  }`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <motion.tr
                key={row.id || `${row.assessmentId}-${index}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="border-b border-slate-100 transition-colors hover:bg-slate-50"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-5 py-4 text-sm text-slate-700 ${column.align === 'right' ? 'text-right' : ''}`}
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </motion.tr>
            )) : (
              <tr>
                <td colSpan={columns.length} className="px-6 py-14 text-center">
                  <div className="text-base font-semibold text-slate-900">{emptyTitle}</div>
                  <div className="mt-2 text-sm text-slate-500">{emptyDescription}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
