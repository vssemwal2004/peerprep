import { HttpError } from '../utils/errors.js';

const indiaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function todayInIndia(now = new Date()) {
  const parts = Object.fromEntries(indiaDate.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function serviceDate(value, label) {
  const date = String(value || '').trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new HttpError(400, `Enter a valid ${label} (YYYY-MM-DD)`);
  }
  return date;
}

export function serviceDates(start, end) {
  const serviceStartDate = serviceDate(start, 'service start date');
  const serviceEndDate = serviceDate(end, 'service end date');
  if (serviceEndDate < serviceStartDate) throw new HttpError(400, 'Service end date must be on or after the start date');
  return { serviceStartDate, serviceEndDate };
}

export function prepMockAccessStatus(university, now = new Date()) {
  if (university?.permissions?.prepmock !== true) return 'disabled';
  if (!university.prepMockStartDate || !university.prepMockEndDate) return 'unconfigured';
  const today = todayInIndia(now);
  if (today < university.prepMockStartDate) return 'upcoming';
  if (today > university.prepMockEndDate) return 'expired';
  return 'active';
}

export function effectiveUniversityPermissions(university, now = new Date()) {
  const permissions = university?.permissions?.toObject?.() || university?.permissions || {};
  return { ...permissions, prepmock: prepMockAccessStatus(university, now) === 'active' };
}

export function servicePeriodStatus(university, now = new Date()) {
  // Existing universities stay accessible until the superadmin sets their dates.
  if (!university?.serviceStartDate || !university?.serviceEndDate) return 'active';
  const today = todayInIndia(now);
  if (today < university.serviceStartDate) return 'upcoming';
  if (today > university.serviceEndDate) return 'expired';
  return 'active';
}

export function servicePeriodMessage(university, status) {
  if (status === 'upcoming') return 'Your university service period has not started. Contact your university administrator.';
  if (status === 'expired') return 'Your university service period has ended. Contact your university administrator to renew access.';
  return '';
}
