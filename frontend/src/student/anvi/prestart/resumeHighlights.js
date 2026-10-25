// What the resume step shows once ANVI has read a resume: skills from a "Skills: …" line of the server's
// preview text, plus the resume sections it found. Pure, so the parsing is tested without rendering.

const SKILL_LABEL = /^(?:key |core |technical |tech |top )?(?:skills?|skill set|technologies|tech stack|technical stack|tools(?: (?:and|&) technologies)?|frameworks|programming languages|languages|competencies)$/i;

const SECTIONS = [
  ["Education", /^(?:education|academics?|qualifications?)$/i],
  ["Experience", /^(?:experience|work experience|professional experience|employment|work history)$/i],
  ["Internships", /^internships?$/i],
  ["Projects", /^(?:projects?|academic projects?|personal projects?|key projects?)$/i],
  ["Skills", SKILL_LABEL],
  ["Certifications", /^(?:certifications?|certificates?|courses?)$/i],
  ["Achievements", /^(?:achievements?|accomplishments?|awards?(?: (?:and|&) achievements?)?|honou?rs?)$/i],
  ["Publications", /^(?:publications?|research)$/i],
  ["Leadership", /^(?:leadership|positions? of responsibility|extracurriculars?|extra-curricular activities|activities)$/i],
  ["Summary", /^(?:summary|profile|objective|career objective|about me)$/i],
];

// Words that name a section anywhere in running text (the last fallback).
const MENTIONS = [
  ["Education", /\b(?:education|b\.?\s?tech|m\.?\s?tech|bachelor|master|cgpa|university|college)\b/i],
  ["Experience", /\b(?:experience|worked at|employment)\b/i],
  ["Internships", /\binterns?(?:hip)?\b/i],
  ["Projects", /\b(?:projects?|built)\b/i],
  ["Skills", /\bskills?\b/i],
  ["Certifications", /\bcertifi(?:ed|cations?|cates?)\b/i],
  ["Achievements", /\b(?:achievements?|awards?|winner|hackathon)\b/i],
];

const LIST = /[,;•·|/]|\s+and\s+/;
const sectionOf = (label) => SECTIONS.find(([, pattern]) => pattern.test(label))?.[0] || "";
const clean = (value) => value.replace(/^[\s•▪◦*\-–—]+/, "").replace(/[\s.;,]+$/, "").trim();

/**
 * `preview`: the stored resume preview text. Returns { skills: [..], sections: [..] } (each de-duplicated
 * and capped), so the UI shows skill chips when a skills line exists and section names otherwise.
 */
export function resumeHighlightsOf(preview, { maxSkills = 8, maxSections = 5 } = {}) {
  const text = String(preview || "");
  const skills = [];
  const sections = [];
  const seen = new Set();
  const addSkill = (value) => {
    const skill = clean(value.replace(/\([^)]*\)/g, ""));
    const key = skill.toLowerCase();
    if (!skill || skill.length > 32 || !/[a-z0-9+#]/i.test(skill) || seen.has(key) || skills.length >= maxSkills) return;
    seen.add(key);
    skills.push(skill);
  };
  const addSection = (name) => { if (name && !sections.includes(name) && sections.length < maxSections) sections.push(name); };

  for (const line of text.split(/\r?\n/)) {
    let inSkills = false;
    // One line may hold several labelled parts ("Skills: Java, React · Projects: …").
    for (const segment of line.split(/\s[·|]\s/)) {
      const labelled = clean(segment).match(/^([A-Za-z][A-Za-z &/-]{1,40}?)\s*(?::|\s[-–—]\s)\s*(.*)$/);
      if (labelled) {
        const label = labelled[1].trim();
        const section = sectionOf(label);
        addSection(section);
        inSkills = SKILL_LABEL.test(label);
        if (inSkills) labelled[2].split(LIST).forEach(addSkill);
      } else if (inSkills) {
        segment.split(LIST).forEach(addSkill);
      }
    }
  }
  // No labelled lines: fall back to section headings written on their own line, or named in the text.
  if (!sections.length) {
    for (const line of text.split(/\r?\n/)) addSection(sectionOf(clean(line).replace(/:$/, "")));
  }
  if (!sections.length) for (const [name, pattern] of MENTIONS) if (pattern.test(text)) addSection(name);
  return { skills, sections };
}
