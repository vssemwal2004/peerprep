const sectionTitles = {
  education: /^(?:(?:academic|educational) (?:background|qualifications?)|education(?:al details)?|education (?:and|&) training)$/i,
  experience: /^(?:(?:work|professional|industry|relevant|internship|research) )?(?:experience|experiences|employment|internships?|work history)$/i,
  projects: /^(?:(?:personal|academic|technical|selected|key|relevant) )?projects?(?: experience)?$/i,
  skills: /^(?:(?:technical|core|professional|key|computer|relevant) )?(?:skills|competencies|technologies|skills and tools)$/i,
  achievements: /^(?:awards?|honou?rs?|achievements?|certificat(?:e|ion)s?|accomplishments)(?:\s*(?:and|&|\/)\s*(?:awards?|honou?rs?|achievements?|certificat(?:e|ion)s?))*$/i,
  summary: /^(?:(?:professional|career|personal|executive) )?(?:summary|profile|objective|overview|about me)$/i,
};

export function sectionKind(line) {
  const label = line.trim().replace(/:$/, '');
  return Object.keys(sectionTitles).find((key) => sectionTitles[key].test(label));
}

