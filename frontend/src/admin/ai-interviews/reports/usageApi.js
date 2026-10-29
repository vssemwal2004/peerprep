import { api } from "../../../utils/api";

const query = (values) => {
  const p = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, v);
  });
  return p.toString();
};

// Gemini usage and estimated cost of the admin's own interviews: ?from=&to= (YYYY-MM-DD, IST days,
// `to` inclusive, at most 180 days) and an optional interviewId.
export const usageApi = {
  get: (values = {}) => api.aiInterviewRequest(`/reports/usage?${query(values)}`),
};
