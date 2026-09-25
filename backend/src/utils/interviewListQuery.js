// Applied only to the management list, after the caller's access scope.
export function interviewListFilter(options = {}, now = new Date()) {
  const filters = [];
  const search = String(options.search || '').trim().slice(0, 120);
  if (search) {
    const literal = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filters.push({ $or: [{ name: { $regex: literal, $options: 'i' } }, { description: { $regex: literal, $options: 'i' } }] });
  }
  if (options.type === 'special') filters.push({ isSpecial: true });
  if (options.type === 'regular') filters.push({ isSpecial: { $ne: true } });
  const running = { status: { $nin: ['draft', 'cancelled', 'archived', 'completed'] } };
  if (options.period === 'active') filters.push({ ...running, startDate: { $lte: now }, endDate: { $gte: now } });
  if (options.period === 'upcoming') filters.push({ ...running, startDate: { $gt: now }, $or: [{ endDate: { $gte: now } }, { endDate: null }] });
  if (options.period === 'previous') filters.push({ $or: [{ status: 'completed' }, { status: { $nin: ['draft', 'cancelled', 'archived'] }, endDate: { $lt: now } }] });
  if (['draft', 'cancelled', 'archived'].includes(options.lifecycle)) filters.push({ status: options.lifecycle });
  return filters;
}

export function interviewListSort(value) {
  if (value === 'oldest') return { createdAt: 1, _id: 1 };
  if (value === 'name') return { name: 1, _id: 1 };
  if (value === 'starts') return { startDate: 1, _id: 1 };
  return { createdAt: -1, _id: -1 };
}
