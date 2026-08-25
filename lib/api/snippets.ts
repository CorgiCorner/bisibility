export const HOSTED_EU_API_BASE_URL = "https://eu.bisibility.com/api/v1";
export const HOSTED_MCP_URL = "https://bisibility.com/api/mcp";
export const API_KEY_PLACEHOLDER = "<API_KEY>";

export type CurlSnippetToken = {
  text: string;
  tone?: "keyword" | "placeholder" | "string";
};

function withoutTrailingSlashes(value: string) {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}

function splitQuotedString(lexeme: string): CurlSnippetToken[] {
  const tokens: CurlSnippetToken[] = [];
  const placeholder = /<[^>]+>/g;
  let last = 0;
  for (const match of lexeme.matchAll(placeholder)) {
    if (match.index > last) {
      tokens.push({ text: lexeme.slice(last, match.index), tone: "string" });
    }
    tokens.push({ text: match[0], tone: "placeholder" });
    last = match.index + match[0].length;
  }
  if (last < lexeme.length) tokens.push({ text: lexeme.slice(last), tone: "string" });
  return tokens;
}

export function tokenizeCurlSnippet(snippet: string): CurlSnippetToken[][] {
  const pattern = /(<[^>]+>|"[^"]*"|'[^']*'|\bcurl\b|-X\b|-H\b|-d\b|\bPOST\b)/g;
  return snippet.split("\n").map((line) => {
    const tokens: CurlSnippetToken[] = [];
    let last = 0;
    for (const match of line.matchAll(pattern)) {
      if (match.index > last) tokens.push({ text: line.slice(last, match.index) });
      const lexeme = match[0];
      if (lexeme.startsWith("<")) tokens.push({ text: lexeme, tone: "placeholder" });
      else if (lexeme.startsWith('"') || lexeme.startsWith("'")) {
        tokens.push(...splitQuotedString(lexeme));
      } else tokens.push({ text: lexeme, tone: "keyword" });
      last = match.index + lexeme.length;
    }
    if (last < line.length) tokens.push({ text: line.slice(last) });
    return tokens.length > 0 ? tokens : [{ text: line }];
  });
}

export function buildCreateKeywordsCurlSnippet(
  projectPublicId: string,
  apiKeyPlaceholder = API_KEY_PLACEHOLDER,
  baseUrl = HOSTED_EU_API_BASE_URL,
) {
  const apiBaseUrl = withoutTrailingSlashes(baseUrl);
  return String.raw`curl -X POST ${apiBaseUrl}/projects/${projectPublicId}/keywords \
  -H "Authorization: Bearer ${apiKeyPlaceholder}" \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": [
      {
        "keyword": "headless cms",
        "target_url": "/headless-cms",
        "country": "Spain",
        "language": "en",
        "device": "desktop",
        "tags": ["launch"]
      }
    ]
  }'`;
}
