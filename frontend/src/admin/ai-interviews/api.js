import { api } from "../../utils/api";
const query = (values) => {
  const p = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v !== undefined && v !== "") p.set(k, v);
  });
  return p.toString();
};
const send = (path, method, body, headers) =>
  api.aiInterviewRequest(path, { method, body, headers });
export const interviewApi = {
  list: (values) => api.aiInterviewRequest(`?${query(values)}`),
  get: (id) => api.aiInterviewRequest(`/${id}`),
  create: (data, key) => send("", "POST", { data }, { "Idempotency-Key": key }),
  save: (id, revision, data) => send(`/${id}`, "PUT", { revision, data }),
  validate: (id, revision) => send(`/${id}/validate`, "POST", { revision }),
  action: (id, action, revision, extra = {}, key) =>
    send(
      `/${id}${action === "delete" ? "" : `/${action}`}`,
      action === "delete" ? "DELETE" : "POST",
      { revision, ...extra },
      key ? { "Idempotency-Key": key } : undefined,
    ),
  resources: (kind, values = {}) =>
    api.aiInterviewRequest(`/resources/${kind}?${query(values)}`),
  saveResource: (kind, data) =>
    send(
      `/resources/${kind}${data._id ? `/${data._id}` : ""}`,
      data._id ? "PUT" : "POST",
      data,
    ),
  library: (values) => api.aiInterviewRequest(`/library?${query(values)}`),
  capabilities: () => api.aiInterviewRequest("/capabilities"),
};
