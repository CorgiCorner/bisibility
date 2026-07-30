export const checkHealthFixture = {
  budget: { capCents: 500, exhausted: false, spentCents: 446 },
  failed24h: { count: 0, latest: null },
  runningCount: 1,
};

export const exhaustedCheckHealthFixture = {
  budget: { capCents: 500, exhausted: true, spentCents: 500 },
  failed24h: {
    count: 2,
    latest: {
      checkedAt: "2026-06-28T10:00:00.000Z",
      error: "Provider request failed.",
      keyword: "headless cms",
      provider: "dataforseo",
    },
  },
  runningCount: 0,
};
