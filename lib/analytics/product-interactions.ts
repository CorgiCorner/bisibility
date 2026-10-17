import { track } from "@/lib/analytics/client";
import { pendingConsent } from "@/lib/analytics/consent";
import { readBrowserConsent } from "@/lib/analytics/consent-client";
import {
  type NavigationClickSource,
  productModuleForPath,
} from "@/lib/analytics/product-interaction-contract";

export function trackModuleNavigation(href: string, source: NavigationClickSource): void {
  if (typeof document === "undefined") return;
  try {
    const module = productModuleForPath(href);
    if (!module || !readBrowserConsent(pendingConsent()).analytics) return;
    track("module_navigation_clicked", { module, source });
  } catch {
    // Optional measurement must not interrupt navigation.
  }
}

export function trackKeywordAction(
  action: "add" | "import" | "export",
  source: "command_palette" | "rank_tracker_toolbar" = "command_palette",
): void {
  if (typeof document === "undefined") return;
  try {
    if (!readBrowserConsent(pendingConsent()).analytics) return;
    track("product_action_clicked", { module: "rank-tracker", action, source });
  } catch {
    // Optional measurement must not interrupt the action.
  }
}
