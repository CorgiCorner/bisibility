export const HOSTED_EU_API_BASE_URL = "https://eu.bisibility.com/api/v1";
export const HOSTED_MCP_URL = "https://bisibility.com/api/mcp";

function withoutTrailingSlashes(value: string) {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}

export function buildCreateKeywordsCurlSnippet(
  projectPublicId: string,
  apiKeyPlaceholder: string,
  baseUrl = HOSTED_EU_API_BASE_URL,
) {
  const apiBaseUrl = withoutTrailingSlashes(baseUrl);
  return String.raw`curl -X POST ${apiBaseUrl}/projects/${projectPublicId}/keywords \
  -H "Authorization: Bearer ${apiKeyPlaceholder}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "keywords": [
      {
        "keyword": "headless cms",
        "target_url": "/headless-cms",
        "country": "United States",
        "device": "desktop",
        "tags": ["launch"]
      }
    ]
  }'`;
}
