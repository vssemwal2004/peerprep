// Tech names as their makers write them. Used to (1) fix casing ("Javascript" -> "JavaScript"),
// (2) suggest the intended name for a misspelt one ("Pyhton" -> "Python"), and (3) teach the
// spell checker these words. Pure data + string distance: no imports, shared with the tests.

export const TECH_TERM_LIST = [
  // languages
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Kotlin', 'Swift', 'Dart', 'Golang', 'Rust', 'C++', 'C#', 'PHP', 'Ruby', 'Scala', 'Perl', 'MATLAB',
  'Haskell', 'Elixir', 'Julia', 'Solidity', 'Bash', 'PowerShell', 'Assembly', 'Verilog', 'VHDL', 'Fortran', 'COBOL', 'Lua', 'Groovy', 'Objective-C',
  // web + mobile
  'React', 'React Native', 'Next.js', 'Nuxt.js', 'Vue.js', 'Angular', 'AngularJS', 'Svelte', 'SvelteKit', 'Node.js', 'Express', 'Express.js', 'NestJS', 'Deno', 'Bun',
  'Django', 'Flask', 'FastAPI', 'Spring', 'Spring Boot', 'Hibernate', 'Laravel', 'Rails', 'ASP.NET', '.NET', 'Flutter', 'Ionic', 'Xamarin', 'Electron',
  'HTML', 'HTML5', 'CSS', 'CSS3', 'Sass', 'SCSS', 'Tailwind CSS', 'Tailwind', 'Bootstrap', 'jQuery', 'Redux', 'Zustand', 'Recoil', 'MobX', 'Vite', 'Webpack', 'Babel',
  'Axios', 'Socket.IO', 'WebSocket', 'WebSockets', 'WebRTC', 'GraphQL', 'Apollo', 'REST', 'gRPC', 'tRPC', 'JWT', 'OAuth', 'Material UI', 'Chakra UI', 'shadcn/ui',
  'Three.js', 'Chart.js', 'D3.js', 'Framer Motion', 'Storybook', 'Jest', 'Vitest', 'Mocha', 'Chai', 'Cypress', 'Playwright', 'Selenium', 'JUnit', 'PyTest', 'Postman',
  'Android', 'iOS', 'Jetpack Compose', 'SwiftUI', 'Expo',
  // data + ML
  'MongoDB', 'Mongoose', 'MySQL', 'PostgreSQL', 'SQLite', 'Redis', 'Valkey', 'Cassandra', 'DynamoDB', 'Firebase', 'Firestore', 'Supabase', 'Prisma', 'Sequelize',
  'Elasticsearch', 'Neo4j', 'Oracle', 'MariaDB', 'Snowflake', 'BigQuery', 'Kafka', 'RabbitMQ', 'Hadoop', 'Spark', 'PySpark', 'Airflow', 'dbt',
  'TensorFlow', 'PyTorch', 'scikit-learn', 'NumPy', 'pandas', 'Matplotlib', 'Seaborn', 'Plotly', 'OpenCV', 'Keras', 'LangChain', 'LlamaIndex', 'Hugging Face',
  'Transformers', 'XGBoost', 'LightGBM', 'NLTK', 'spaCy', 'YOLO', 'Jupyter', 'Streamlit', 'Gradio', 'OpenAI', 'Gemini', 'Ollama',
  // cloud + tools
  'GitHub', 'GitLab', 'Bitbucket', 'Git', 'Docker', 'Kubernetes', 'Helm', 'AWS', 'GCP', 'Azure', 'Vercel', 'Netlify', 'Heroku', 'Render', 'Cloudflare', 'Nginx', 'Apache',
  'Jenkins', 'Terraform', 'Ansible', 'Prometheus', 'Grafana', 'Linux', 'Ubuntu', 'Unix', 'Windows', 'macOS', 'Figma', 'Canva', 'Jira', 'Confluence', 'Notion', 'Slack',
  'VS Code', 'IntelliJ', 'Eclipse', 'Android Studio', 'Xcode', 'Arduino', 'Raspberry Pi', 'Markdown', 'LaTeX', 'Excel', 'Power BI', 'Tableau', 'Looker',
  'LinkedIn', 'LeetCode', 'Codeforces', 'CodeChef', 'HackerRank', 'HackerEarth', 'GeeksforGeeks', 'Kaggle',
  // concepts + abbreviations
  'API', 'APIs', 'JSON', 'XML', 'YAML', 'SQL', 'NoSQL', 'DSA', 'DBMS', 'RDBMS', 'OOP', 'OOPs', 'CI/CD', 'MERN', 'MEAN', 'IoT', 'UI', 'UX', 'UI/UX', 'SDK', 'CLI',
  'ML', 'AI', 'NLP', 'LLM', 'LLMs', 'RAG', 'CNN', 'RNN', 'LSTM', 'GAN', 'MVC', 'MVVM', 'SaaS', 'DevOps', 'MLOps', 'SEO', 'TCP/IP', 'HTTP', 'HTTPS', 'DNS',
];

/** lower-case name -> the way it is written. */
export const TECH_TERMS = Object.fromEntries(TECH_TERM_LIST.map((term) => [term.toLowerCase(), term]));

// One-word names only: fuzzy matching a phrase ("REST APIs") against a phrase misfires.
const FUZZY_POOL = TECH_TERM_LIST.filter((term) => !/\s/.test(term) && /^[A-Za-z][A-Za-z.+#-]*[A-Za-z+#]$/.test(term) && term.replace(/[^A-Za-z]/g, '').length >= 4);

/** Optimal string alignment distance: an edit, insert, delete or swap of two neighbours costs 1. */
export function typoDistance(a, b) {
  const s = String(a); const t = String(b);
  const rows = Array.from({ length: s.length + 1 }, (_, i) => Array.from({ length: t.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[s.length][t.length];
}

/**
 * The tech name a one-word token most likely meant ("Pyhton" -> "Python", "JavaSrcipt" -> "JavaScript"),
 * or null. Exact names (any casing) return null: casing is a separate check.
 * Allowed distance: 1 for 4–6 letters, 2 for 7+. Shorter words are never guessed.
 */
export function nearestTechTerm(token) {
  const word = String(token || '').trim();
  const lower = word.toLowerCase();
  if (lower.length < 4 || TECH_TERMS[lower] || /\s|\d/.test(word)) return null;
  const limit = lower.length >= 7 ? 2 : 1;
  let best = null;
  for (const term of FUZZY_POOL) {
    const candidate = term.toLowerCase();
    if (Math.abs(candidate.length - lower.length) > limit) continue;
    const distance = typoDistance(lower, candidate);
    if (distance <= limit && (!best || distance < best.distance)) best = { term, distance };
  }
  return best ? best.term : null;
}
