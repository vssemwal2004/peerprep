const modules = { coding: 'questions', learning: 'learning', assessments: 'assessments', interviews: 'interviews', events: 'events' };

// A policy refresh can render before a new engagement response arrives. Drop revoked data immediately.
export function scopeEngagement(data, allowsModule) {
  if (!data || data.version !== 2) return data;
  const domains = (data.domains || []).filter((domain) => allowsModule(modules[domain]));
  const badges = (data.badges || []).filter((badge) => !modules[badge.category] || domains.includes(badge.category));
  // Challenge milestones are not a feature of their own; they stay while any feature remains allowed.
  const keep = (key) => domains.includes(key) || (key === 'challenges' && domains.length > 0);
  const breakdownByDate = Object.fromEntries(Object.entries(data.activity?.breakdownByDate || {}).map(([day, counts]) => [day,
    Object.fromEntries(Object.entries(counts).filter(([key]) => keep(key))),
  ]));
  const activityByDate = Object.fromEntries(Object.entries(breakdownByDate).map(([day, counts]) => [day, Object.values(counts).reduce((sum, value) => sum + value, 0)]).filter(([, count]) => count > 0));
  return { ...data, domains, badges, awards: { ...data.awards, awards: badges, earnedCount: badges.filter((badge) => badge.earned).length,
    nextAward: badges.filter((badge) => !badge.earned).sort((a, b) => b.progress - a.progress)[0] || null },
    activity: { activityByDate, breakdownByDate, stats: { totalActiveDays: Object.keys(activityByDate).length } },
  };
}
