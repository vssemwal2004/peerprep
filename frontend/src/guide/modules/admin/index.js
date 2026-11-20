// Every admin page guide (loaded only for admins). Format: src/guide/platform/registry.js.
import home from "./home.js";
import students from "./students.js";
import coordinators from "./coordinators.js";
import interviews from "./interviews.js";
import assessments from "./assessments.js";
import library from "./library.js";
import quickprep from "./quickprep.js";
import learning from "./learning.js";
import analysis from "./analysis.js";
import coins from "./coins.js";
import settings from "./settings.js";
import communication from "./communication.js";
import universities from "./universities.js";
import account from "./account.js";

export default [
  ...home, ...students, ...coordinators, ...assessments, ...library, ...quickprep, ...interviews, ...learning,
  ...analysis, ...coins, ...communication, ...settings, ...universities, ...account,
];
