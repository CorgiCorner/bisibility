export { GET } from "@/app/.well-known/mcp/server-card.json/route";

// Next 16 reads route segment config from the route module itself, so this cannot be
// re-exported from the route this alias forwards to.
export const dynamic = "force-dynamic";
