// Query parsing for the read-only "university students" inspection list, shared by the control plane
// (which signs the path) and the university server (which answers it). Everything is whitelisted:
// older university servers simply ignore pageSize/sortBy/sortOrder and answer 25 newest-first.

export const INSPECTION_PAGE_SIZES = Object.freeze([10, 25, 50, 100]);
export const INSPECTION_DEFAULT_PAGE_SIZE = 25;

// Table column → stored field. `status` sorts Active before Inactive when ascending.
const SORT_FIELDS = Object.freeze({
  name: { field: 'name', flip: false },
  studentId: { field: 'studentId', flip: false },
  course: { field: 'course', flip: false },
  status: { field: 'isActive', flip: true },
});

const read = (params, key) => (typeof params?.get === 'function' ? params.get(key) : params?.[key]);

export function inspectionStudentQuery(params = {}) {
  const page = Math.max(1, Math.min(100000, Number.parseInt(read(params, 'page'), 10) || 1));
  const requestedSize = Number.parseInt(read(params, 'pageSize'), 10);
  const pageSize = INSPECTION_PAGE_SIZES.includes(requestedSize) ? requestedSize : INSPECTION_DEFAULT_PAGE_SIZE;
  const search = String(read(params, 'search') || '').trim().slice(0, 80);
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = { role: 'student', ...(search ? { $or: ['name', 'studentId', 'email'].map((field) => ({ [field]: { $regex: escaped, $options: 'i' } })) } : {}) };
  const key = String(read(params, 'sortBy') || '');
  const column = Object.hasOwn(SORT_FIELDS, key) ? SORT_FIELDS[key] : null;
  const sortOrder = column && read(params, 'sortOrder') === 'desc' ? 'desc' : 'asc';
  const direction = sortOrder === 'desc' ? -1 : 1;
  const sort = column ? { [column.field]: column.flip ? -direction : direction, _id: -1 } : { _id: -1 };
  return { page, pageSize, search, filter, sort, sortBy: column ? key : null, sortOrder: column ? sortOrder : null };
}

/** The canonical inspection path for a list request; it is signed, so it must be built the same way every time. */
export function inspectionStudentPath(query) {
  const params = new URLSearchParams({ page: String(query.page), search: query.search });
  if (query.pageSize !== INSPECTION_DEFAULT_PAGE_SIZE) params.set('pageSize', String(query.pageSize));
  if (query.sortBy) { params.set('sortBy', query.sortBy); params.set('sortOrder', query.sortOrder); }
  return `/students?${params.toString()}`;
}
