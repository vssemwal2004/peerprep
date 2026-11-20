// Every student page guide (loaded only for students). Format: src/guide/platform/registry.js.
import home from "./home.js";
import practice from "./practice.js";
import progress from "./progress.js";
import learning from "./learning.js";
import assessments from "./assessments.js";
import interviews from "./interviews.js";
import analysis from "./analysis.js";
import account from "./account.js";

export default [...home, ...practice, ...assessments, ...interviews, ...learning, ...analysis, ...progress, ...account];
