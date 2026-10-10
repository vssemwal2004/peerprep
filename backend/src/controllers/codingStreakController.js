import { getCodingStreakStatus, getDailyChallengeConfig, updateDailyChallengeConfig } from '../services/codingStreakService.js';
import { dashboardPermissions } from '../services/studentDashboardService.js';

export async function getDailyChallenge(req, res) {
  res.set('Cache-Control', 'private, no-store');
  if (!(await dashboardPermissions(req.user)).questions) return res.json({ enabled: false, challenge: null });
  res.json(await getCodingStreakStatus(req.user._id));
}

export async function getDailyChallengeSettings(req, res) {
  res.json({ settings: await getDailyChallengeConfig() });
}

export async function saveDailyChallengeSettings(req, res) {
  const settings = await updateDailyChallengeConfig(req.body || {}, req.user._id);
  res.json({ settings });
}
