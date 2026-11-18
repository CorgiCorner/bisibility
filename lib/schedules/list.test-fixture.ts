import type { SourceConfiguration } from "@/lib/ai-tracking/contract";

export const rankFixture = {
  archivedAt: null,
  assignedKeywordCount: 2,
  blocked: false,
  cronExpression: null,
  dayOfMonth: null,
  enabled: true,
  frequency: "daily" as const,
  jitterMinutes: 15,
  keywordCount: 1,
  memberDeviceCount: 1,
  memberMarketCount: 2,
  name: "Daily 06:00",
  nextRunAt: null,
  perRunCents: 24,
  publicId: "sch_daily",
  sharedTag: null,
  targetCount: 2,
  timeOfDay: "06:00",
  timezone: "UTC",
  weekday: null,
  providerPolicy: null,
  serpDepth: 20,
};
export const aiConfiguration: SourceConfiguration = {
  endpoint: "ai_optimization/chat_gpt/llm_scraper/task_post",
  engine: "chat_gpt",
  model: null,
  parameters: {},
  provider: "dataforseo",
  source: "consumer_scrape",
};
export const aiFixture = {
  archivedAt: null,
  cron: "0 9 * * 1",
  enabled: true,
  id: "ais_weekly",
  name: "Weekly prompts",
  nextRunAt: null,
  timezone: "UTC",
  promptIds: ["aip_one", "aip_two"],
  configurations: [aiConfiguration],
};
export const priceNow = new Date("2026-10-08T00:00:00.000Z");
