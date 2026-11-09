import { hasReceivedRankResult } from "@/lib/activity/result-payload";
import { recordResultReceipt } from "@/lib/activity/result-receipt-extension";
import { after } from "next/server";

/** Called only after the authenticated, scoped dispatcher succeeds. No response wait. */
export function recordApiResultReceipt(response: Response, userId: string | null, mcp: boolean) {
  if (
    !userId ||
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    return;
  let copy: Response;
  try {
    copy = response.clone();
  } catch {
    console.error("[result-receipt] Could not inspect response.");
    return;
  }
  const inspect = () =>
    copy
      .json()
      .then((payload: unknown) => {
        recordResultReceipt({
          userId,
          surface: mcp ? "mcp" : "api",
          nonEmpty: hasReceivedRankResult(payload),
        });
      })
      .catch(() => {
        console.error("[result-receipt] Could not inspect response.");
      });
  try {
    after(inspect);
  } catch {
    void inspect();
  }
}
