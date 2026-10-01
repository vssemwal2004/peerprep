import { getCodingStreakStatus, getDailyChallengeConfig, updateDailyChallengeConfig } from '../services/codingStreakService.js';

export async function getDailyChallenge(req, res) {
  res.json(await getCodingStreakStatus(req.user._id));
}

export async function getDailyChallengeSettings(req, res) {
  res.json({ settings: await getDailyChallengeConfig() });
}

export async function saveDailyChallengeSettings(req, res) {
  const settings = await updateDailyChallengeConfig(req.body || {}, req.user._id);
  res.json({ settings });
}
