export const FIELD_HELP = {
  inspectionDailyLimit:
    "Maximum URL Inspection calls this project can make each day. Set 0 to disable index-status checks.",
  frequency:
    "How often ranks are checked automatically, from daily through monthly. Manual and Paused stop scheduled checks.",
  cron: "Custom schedule in cron syntax: minute hour day-of-month month day-of-week.",
  timezone: "Anchors daily, weekly, monthly, and custom schedules to the selected local clock.",
  jitter:
    "Each keyword has a stable position within its check interval; jitter adds a random delay of 0 to N minutes so it does not land at the exact same moment every run, reducing overlap with provider rate-limit windows or maintenance blips.",
  serpDepth:
    "How deep in the results we look (Top N). Keywords ranking below N are reported as not found.",
  keyword: "The exact search query being tracked.",
  targetUrl: "The page you expect to rank. Used to highlight when a different URL ranks instead.",
  device: "Desktop and mobile results often differ - each device is checked separately.",
  location: "Country or city the search results are localized to.",
  topic: "Free-form grouping label for filtering and reporting.",
  intent: "Search intent category (informational, transactional, ...) for filtering and reporting.",
  tags: "Comma-separated labels for filtering; not sent to providers.",
} as const;
