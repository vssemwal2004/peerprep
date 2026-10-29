import { api } from "../../../utils/api";
import { studentCsvFile } from "../../../components/interviews/interviewSetup";
import { CHECK_CSV_BATCH, chunk } from "./scheduleModel";

/**
 * Rechecks a roster with the interview CSV validator (POST /events/participants/check-csv),
 * in batches of 1,000 rows. Returns the rows that are not "ready", numbered across batches.
 */
export async function recheckStudents(selected) {
  const invalid = [];
  for (const [index, batch] of chunk(selected, CHECK_CSV_BATCH).entries()) {
    const response = await api.checkInterviewParticipantCsv(studentCsvFile(batch));
    if (response?.results?.length !== batch.length) throw new Error("The server returned an incomplete review. Please try again.");
    response.results.forEach((row, offset) => {
      if (row.status !== "ready") invalid.push({ ...row, row: index * CHECK_CSV_BATCH + offset + 1, name: batch[offset]?.name });
    });
  }
  return invalid;
}

/**
 * Maps the server's INVALID_STUDENTS ids (inactive or assessment-only accounts, which the CSV check
 * does not catch) back to the selected rows, so the admin can see and remove them.
 */
export function ineligibleRows(selected = [], invalidIds = []) {
  const wanted = new Set((invalidIds || []).map(String));
  return selected
    .map((student, index) => ({ student, index }))
    .filter(({ student }) => wanted.has(String(student._id)))
    .map(({ student, index }) => ({
      row: index + 1, _id: String(student._id), name: student.name, email: student.email, studentid: student.studentId || student.studentid,
      message: "not an active student who can take AI interviews (inactive or assessment-only account)",
    }));
}
