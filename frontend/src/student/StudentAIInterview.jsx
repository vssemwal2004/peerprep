import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { api } from "../utils/api";
import VoiceInterviewRoom from "./VoiceInterviewRoom";

export default function StudentAIInterview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [interviews, setInterviews] = useState([]);
  const [resumeConsent, setResumeConsent] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (sessionId) return undefined;
    let active = true;
    api.listStudentAIInterviews().then((items) => { if (active) setInterviews(items); })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionId]);
  if (sessionId) return <VoiceInterviewRoom sessionId={sessionId} />;
  const start = async (item) => {
    setBusy(true); setError("");
    try {
      const session = await api.startStudentAIInterview(item.id, resumeConsent[item.id] === true);
      navigate(`/student/ai-interviews/room/${session.id}`);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-white"><div className="mx-auto max-w-3xl space-y-5"><h1 className="text-2xl font-bold">AI Interviews</h1><p className="text-sm text-slate-500">Speak with ANNU in a voice interview.</p>{error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{loading ? <p>Loading interviews…</p> : interviews.length === 0 ? <p>No AI interviews are available yet.</p> : interviews.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between gap-4"><div><h2 className="font-semibold">{item.title}</h2><p className="text-sm text-slate-500">{item.role}{item.companyName ? ` · ${item.companyName}` : ""}</p><p className="text-xs text-slate-500">{item.status === "completed" ? "Completed" : item.status === "active" ? "In progress" : "Ready to start"}</p></div><button type="button" disabled={busy || item.status === "completed" || (item.requiresResume && item.status === "not_started" && !resumeConsent[item.id])} onClick={() => start(item)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{item.status === "active" ? "Continue" : "Start"}<ArrowRight size={16}/></button></div>{item.requiresResume && item.status === "not_started" && <label className="mt-3 flex gap-2 text-xs"><input type="checkbox" checked={Boolean(resumeConsent[item.id])} onChange={(event) => setResumeConsent((current) => ({ ...current, [item.id]: event.target.checked }))}/><span>I agree to use my saved resume to generate interview questions.</span></label>}</article>)}<p className="text-sm text-slate-500">Resume questions use your saved <Link className="text-indigo-600 underline" to="/student/resume">resume</Link>.</p></div></div>;
}
