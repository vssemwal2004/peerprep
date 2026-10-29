import { useParams } from "react-router-dom";
import AnviInterviewsPage from "./anvi/AnviInterviewsPage";
import AnviRoom from "./anvi/AnviRoom";

// `sessionId` in the room route is the ANVI attempt id.
export default function StudentAIInterview() {
  const { sessionId } = useParams();
  return sessionId ? <AnviRoom key={sessionId} attemptId={sessionId} /> : <AnviInterviewsPage />;
}
