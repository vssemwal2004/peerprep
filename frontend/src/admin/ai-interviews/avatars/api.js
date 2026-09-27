import { api } from "../../../utils/api";

export const AVATAR_ROOT = "/admin/ai-interviews/avatars";
const send = (path = "", options = {}) =>
  api.aiInterviewRequest(`/avatars${path}`, options);
export const avatarApi = {
  capabilities: () => send("/capabilities"),
  list: (values) =>
    send(
      `?${new URLSearchParams(Object.entries(values).filter(([, value]) => value !== "" && value !== undefined)).toString()}`,
    ),
  get: (id) => send(`/${id}`),
  create: (data) => send("", { method: "POST", body: { data } }),
  save: (id, revision, data) =>
    send(`/${id}`, { method: "PUT", body: { revision, data } }),
  upload: (id, revision, kind, file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", kind);
    formData.append("revision", String(revision));
    return send(`/${id}/uploads`, {
      method: "POST",
      formData,
      timeoutMs: 120000,
    });
  },
  render: (id, revision) =>
    send(`/${id}/render`, {
      method: "POST",
      body: { revision },
      timeoutMs: 120000,
    }),
  status: (id) => send(`/${id}/render`),
  transcribe: (id, revision) =>
    send(`/${id}/transcribe`, {
      method: "POST",
      body: { revision },
      timeoutMs: 120000,
    }),
  assist: (id, revision, action, language) =>
    send(`/${id}/assist`, {
      method: "POST",
      body: { revision, action, language },
      timeoutMs: 120000,
    }),
  archive: (id, revision, active) =>
    send(`/${id}/archive`, { method: "POST", body: { revision, active } }),
};
