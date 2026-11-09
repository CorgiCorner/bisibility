import type { Entry } from "@/components/admin/redesign/oss-capability-types";
import { realPage } from "./real-page-mocks.test-fixture";

/** Same capability assertions, with real route links and production error copy. */
export function realCapability(entry: Entry): Entry {
  const proof = { ...entry.proof };
  if (["S003", "S004", "S005", "S013"].includes(entry.id)) proof.role = "link";
  if (["A057", "A090"].includes(entry.id))
    proof.href = `/app/account/security?returnTo=${encodeURIComponent(`${realPage.path}?${realPage.params}`)}`;
  const texts: Record<string, string> = {
    A047: "Account lookup is temporarily unavailable.",
    A048: "This action is not available.",
    R014: "Recovery is temporarily unavailable. Refresh the command status before retrying.",
    R015: "Recovery is temporarily unavailable. Refresh the command status before retrying.",
    R029: "Instance data is unavailable.",
    R090: "Recovery is temporarily unavailable. Refresh the command status before retrying.",
    R105: "Recovery is temporarily unavailable. Refresh the command status before retrying.",
    L013: "Instance data is unavailable.",
  };
  if (texts[entry.id]) proof.text = texts[entry.id];
  if (entry.id === "L013") proof.role = "alert";
  if (entry.id === "R014") proof.scope = "dialog";
  if (entry.id === "R026") delete proof.within;
  if (proof.text === "Changed setting") proof.text = "instance_admin.first_run_setting";
  return { ...entry, proof };
}
