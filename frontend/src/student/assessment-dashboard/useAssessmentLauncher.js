import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';

/**
 * The start flow shared by Prep Assessment and Prep Mock: `launch(card)` opens AssessmentLaunchModal
 * (details, password when set); unlocking calls the start API and opens /student/assessment/:id, where
 * the desktop-only gate, rules and proctoring setup run exactly as for any assessment.
 *   const launcher = useAssessmentLauncher();
 *   <AssessmentLaunchModal {...launcher.modalProps} />
 */
export function useAssessmentLauncher() {
  const navigate = useNavigate();
  const [launchAssessment, setLaunchAssessment] = useState(null);
  const close = useCallback(() => setLaunchAssessment(null), []);

  return {
    launch: setLaunchAssessment,
    modalProps: {
      assessment: launchAssessment,
      open: Boolean(launchAssessment),
      onClose: close,
      onUnlock: async (password) => {
        if (!launchAssessment) return;
        await api.startStudentAssessment(launchAssessment._id, password);
      },
      onStart: () => {
        if (!launchAssessment) return;
        const assessmentId = launchAssessment._id;
        setLaunchAssessment(null);
        navigate(`/student/assessment/${assessmentId}`);
      },
    },
  };
}
