import { createAnviStudentRouter } from "../modules/anviInterview/anviInterview.routes.js";

// Student AI interviews are conducted by ANVI inside PeerPrep (REST here, live audio over Socket.IO).
export default createAnviStudentRouter();
