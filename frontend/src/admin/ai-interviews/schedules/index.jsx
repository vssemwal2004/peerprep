import { Route, Routes } from "react-router-dom";
import SchedulesPage from "./SchedulesPage";
import ScheduleWizard from "./ScheduleWizard";
import ScheduleDetail from "./ScheduleDetail";
import AssignedStudents from "./AssignedStudents";

/**
 * Scheduling routes, mounted by the workspace at "schedules/*":
 *   ""                                → list of schedules
 *   "new"                             → five-step wizard (?interviewId= preselects a published interview;
 *                                       ?from=schedules also offers "Change")
 *   ":id"                             → schedule detail, roster and cohort report
 *   ":id/edit"                        → the same wizard on a saved schedule (students prefilled; saves the change only)
 *   ":id/students"                    → assigned students of one schedule
 *   "interview/:interviewId/students" → assigned students across every schedule of one interview
 * `navigation` is the workspace's secondary navigation element, shown on the list and detail pages.
 */
export function AnviSchedulesRoutes({ navigation = null }) {
  return (
    <Routes>
      <Route index element={<SchedulesPage navigation={navigation} />} />
      <Route path="new" element={<ScheduleWizard />} />
      <Route path="interview/:interviewId/students" element={<AssignedStudents />} />
      <Route path=":id/edit" element={<ScheduleWizard />} />
      <Route path=":id/students" element={<AssignedStudents />} />
      <Route path=":id" element={<ScheduleDetail navigation={navigation} />} />
    </Routes>
  );
}

export default AnviSchedulesRoutes;
