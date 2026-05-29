import { useCallback, useEffect, useState } from 'react';
import { api } from '../../utils/api';

const EMPTY_DASHBOARD = {
  currentStudent: { id: '', rank: null },
  overview: {
    upcomingCount: 0,
    liveCount: 0,
    reportsCount: 0,
    historyCount: 0,
    averageScore: 0,
    bestScore: 0,
  },
  upcomingAssessments: [],
  ongoingAssessments: [],
  completedAssessments: [],
  reports: [],
  history: [],
};

export function useStudentAssessmentDashboardData() {
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await api.getStudentAssessmentDashboard();
        if (!active) return;
        setDashboard({
          ...EMPTY_DASHBOARD,
          ...response,
        });
      } catch (err) {
        if (!active) return;
        setError(err.message || 'Failed to load assessment dashboard');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [reloadKey]);

  return { dashboard, loading, error, refresh };
}
