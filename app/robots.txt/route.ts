import { createSelfHostedRobotsResponse } from "@/lib/deployment/crawl-control";

export const dynamic = "force-dynamic";

export function GET() {
  return createSelfHostedRobotsResponse();
}
