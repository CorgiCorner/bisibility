const BOT =
  /bot|crawl|spider|slurp|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|preview|slackbot|discord|linkedinbot|twitterbot|applebot|bingpreview|petalbot/i;

export function shouldCountShareView(headers: { get(name: string): string | null }): boolean {
  const purpose =
    `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`.toLowerCase();
  if (purpose.includes("prefetch")) return false;
  if (headers.get("next-router-prefetch") === "1") return false;
  if (headers.get("x-middleware-prefetch") === "1") return false;
  const agent = headers.get("user-agent") ?? "";
  return !BOT.test(agent);
}
