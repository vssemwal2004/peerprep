// Fictional sample content used to preview templates before a student has
// entered anything. Every name, link and number here is made up.
export const SAMPLE_RESUME = Object.freeze({
  exists: false,
  sample: true,
  template: 'iit-bombay-classic',
  basics: {
    name: 'Aarav Sharma',
    headline: 'Software Engineer · Full-Stack Developer',
    location: 'Dehradun, India',
    email: 'aarav.sharma@example.com',
    mobile: '+91 98765 43210',
    linkedin: 'https://linkedin.com/in/aarav-sample',
    github: 'https://github.com/aarav-sample',
    portfolio: '',
  },
  basicsVisibility: { location: true, email: true, mobile: true, linkedin: true, github: true, portfolio: true },
  education: [
    { year: '2022 – 2026', degree: 'B.Tech, Computer Science and Engineering', institute: 'Northfield Institute of Technology', score: 'CGPA 8.62 / 10' },
    { year: '2022', degree: 'Class XII (CBSE)', institute: 'Green Valley Senior Secondary School', score: '91.4%' },
  ],
  experience: [
    {
      title: 'Brightline Software Pvt. Ltd.', subtitle: 'Software Engineering Intern', location: 'Bengaluru (Hybrid)', date: 'May 2025 – Jul 2025', link: '', technologies: 'React, Node.js, PostgreSQL',
      bullets: [
        { text: 'Built a **role-based admin dashboard** used by 40+ support staff, replacing three spreadsheets.' },
        { text: 'Reduced report generation time from 9 s to 1.4 s by adding indexed queries and server-side caching.' },
        { text: 'Wrote 60+ unit tests and set up CI checks that blocked failing builds before review.' },
      ],
    },
    {
      title: 'Open Source — Sample Docs Toolkit', subtitle: 'Contributor', location: 'Remote', date: 'Jan 2025 – Apr 2025', link: '', technologies: 'TypeScript, Markdown',
      bullets: [
        { text: 'Merged 7 pull requests fixing accessibility issues in the search component.' },
        { text: 'Added keyboard navigation tests in TypeScript that now run on every release.' },
      ],
    },
  ],
  projects: [
    {
      title: 'CampusRide — Shared Commute Planner', subtitle: 'Team of 3 · Hackathon finalist', location: '', date: 'Mar 2025', link: 'https://github.com/aarav-sample/campusride', technologies: 'Flutter, Firebase, Google Maps API',
      bullets: [
        { text: 'Designed a route-matching algorithm that grouped riders within 600 m of a shared path.' },
        { text: 'Shipped the MVP in 36 hours; demoed to 200+ attendees and placed in the top 5 of 48 teams.' },
      ],
    },
    {
      title: 'PrepTrack — Coding Practice Analytics', subtitle: 'Personal project', location: '', date: 'Oct 2024', link: '', technologies: 'Python, FastAPI, React, Chart.js',
      bullets: [
        { text: 'Implemented topic-wise progress charts and streak tracking from 1,200+ submission records.' },
      ],
    },
  ],
  skills: [
    { category: 'Languages', skills: 'C++, Java, Python, JavaScript, SQL' },
    { category: 'Web & Mobile', skills: 'React, Node.js, Express, Flutter, REST APIs' },
    { category: 'Tools & Cloud', skills: 'Git, Docker, Linux, AWS (EC2, S3), Postman' },
    { category: 'Core CS', skills: 'Data Structures, Algorithms, DBMS, OOP, Operating Systems' },
  ],
  achievements: [
    { title: 'Smart India Hackathon 2024 — Finalist', subtitle: 'Ministry of Education', location: '', date: 'Dec 2024', link: '', technologies: '', bullets: [] },
    { title: 'Solved 450+ problems across coding platforms', subtitle: 'Max rating 1,742', location: '', date: '2023 – 2025', link: '', technologies: '', bullets: [] },
  ],
  customSections: [
    {
      id: 'sample-certifications', title: 'CERTIFICATIONS', format: 'details',
      entries: [
        { title: 'AWS Certified Cloud Practitioner', subtitle: 'Amazon Web Services', location: '', date: '2025', link: '', technologies: '', bullets: [] },
        { title: 'Database Management Essentials', subtitle: 'Online course', location: '', date: '2024', link: '', technologies: '', bullets: [] },
      ],
    },
  ],
  sectionOrder: ['education', 'experience', 'projects', 'skills', 'achievements', 'custom:sample-certifications'],
  hiddenSections: [],
  completion: 100,
});

/** The sample, shown in a chosen template. */
export const sampleResumeFor = (templateId) => ({ ...SAMPLE_RESUME, template: templateId });
