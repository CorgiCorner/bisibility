export const fieldPayload = {
  lighthouseResult: {
    audits: {
      "cumulative-layout-shift": { numericValue: 0.04 },
      "largest-contentful-paint": { numericValue: 2400 },
      "total-blocking-time": { numericValue: 180 },
    },
  },
  loadingExperience: {
    metrics: {
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { category: "FAST", percentile: 2 },
      INTERACTION_TO_NEXT_PAINT: { category: "FAST", percentile: 120 },
      LARGEST_CONTENTFUL_PAINT_MS: { category: "FAST", percentile: 2100 },
    },
    overall_category: "FAST",
  },
  originLoadingExperience: {
    metrics: {
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { category: "AVERAGE", percentile: 12 },
      INTERACTION_TO_NEXT_PAINT: { category: "AVERAGE", percentile: 240 },
      LARGEST_CONTENTFUL_PAINT_MS: { category: "AVERAGE", percentile: 3100 },
    },
    overall_category: "AVERAGE",
  },
};

export const originPayload = {
  lighthouseResult: fieldPayload.lighthouseResult,
  loadingExperience: { metrics: {}, overall_category: "NONE" },
  originLoadingExperience: fieldPayload.originLoadingExperience,
};

export const labPayload = {
  lighthouseResult: fieldPayload.lighthouseResult,
  loadingExperience: {},
  originLoadingExperience: {},
};
