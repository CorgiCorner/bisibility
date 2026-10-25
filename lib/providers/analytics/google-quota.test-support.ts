// Documented shape, not captured: https://google.aip.dev/193
// Detail definitions: https://github.com/googleapis/googleapis/blob/master/google/rpc/error_details.proto
export function quotaPayload(limit: string, retryDelay = "17s") {
  return {
    error: {
      code: 429,
      status: "RESOURCE_EXHAUSTED",
      errors: [{ reason: "rateLimitExceeded" }],
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "RATE_LIMIT_EXCEEDED",
          domain: "googleapis.com",
          metadata: {
            quota_metric: "searchconsole.googleapis.com/url_inspection",
            quota_limit: limit,
            quota_limit_value: limit.includes("Day") ? "2000" : "600",
          },
        },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay },
      ],
    },
  };
}
