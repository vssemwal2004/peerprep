// A rich English interview used to pin the Live plan and Live prompts byte for byte (anviPlan/anviPrompts
// snapshot tests). The snapshot in anviLiveSnapshots.json was captured before the hybrid planning work.
import { normalizeDefinition } from "../../src/services/aiInterviewDefinition.js";

export const LIVE_SEED = "665f1c2b9a1e4b0012345678";
export const LIVE_RESUME = "Projects:\n- Chat app (Node, MongoDB): built real-time rooms.\nSkills:\n- Languages: JavaScript, Python";

export function liveFixture() {
  return normalizeDefinition({
    title: "Snapshot interview", role: "Backend Intern", companyName: "Acme", experience: "fresher", difficulty: "medium",
    rules: { language: "English", responseSeconds: 90 },
    interviewer: { profileId: "p1", displayName: "ANVI", tone: "Friendly", introduction: "Hello {name}!", closing: "All the best." },
    anvi: {
      persona: { tone: "formal", pace: "brisk", acknowledgements: true, introduction: "", closing: "" },
      warmup: { enabled: true, icebreakers: 1, tellMeAboutYourself: true, scored: true },
      resume: { mode: "optional", questionCount: 1 },
      conduct: { endByVoice: true },
      liveQuestionCount: 3,
    },
    sections: [
      { id: "s1", name: "Core", category: "Technical", weight: 60, groups: [
        { id: "g1", name: "APIs", weight: 50, questions: [
          { id: "q1", kind: "specific", prompt: "Question 1: Explain REST and when you would avoid it.", expectedAnswer: "- Stateless\n- Resources\n- Uniform interface",
            subquestions: [{ id: "sq1", prompt: "How do you version an API?" }], followUps: [{ id: "f1", prompt: "Why does statelessness matter?" }, { id: "f2", prompt: "Q2: What about idempotency?" }], maxFollowUps: 1, marks: 20 },
          { id: "q2", kind: "topic", prompt: "caching strategies", expectedAnswer: "TTL. Invalidation." },
          { id: "q3", kind: "resume", prompt: "Focus on the backend project", resumeCount: 1 },
        ] },
        { id: "g2", name: "Databases", weight: 50, source: "annu", priority: "high", annu: { requirements: "Indexes and transactions.", skills: ["Indexes", "Transactions"], maxFollowUps: 1 } },
      ] },
      { id: "s2", name: "Behaviour", category: "Behavioral", weight: 40, groups: [
        { id: "g3", name: "Teamwork", weight: 100, shuffle: true, questions: [
          { id: "b1", kind: "specific", prompt: "Tell me about a disagreement in a team." },
          { id: "b2", kind: "specific", prompt: "Describe a deadline you missed." },
          { id: "b3", kind: "specific", prompt: "How do you take feedback?" },
        ] },
      ] },
    ],
    rubric: [{ id: "r1", name: "Clarity", weight: 100 }],
  });
}

// Deterministic generator: echoes the request kind and count so the snapshot is stable.
export function fakeGenerate(requests = []) {
  return async (request) => {
    requests.push(request);
    return Array.from({ length: request.count }, (_, i) => ({
      text: `Generated ${request.kind} question ${i + 1} about ${request.groupName || request.sectionName || "the resume"}?`,
      keyPoints: [`point ${i + 1}`],
    }));
  };
}
