import { previewScheduleChangeAction } from "@/lib/actions/schedule-review";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse } from "@/lib/api/responses";
import { isScheduleActionFailure } from "@/lib/schedules/action-result";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Keep the authenticated preview action behind the browser's HTTP boundary. */
export const POST = withAppRoute(async (request) => {
  const result = await previewScheduleChangeAction(await request.json());
  return dataResponse(result, {
    status: isScheduleActionFailure(result) ? result.error.status : 200,
  });
});
