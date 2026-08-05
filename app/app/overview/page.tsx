import { appRootPath } from "@/lib/routing/app-path";
import { redirect } from "next/navigation";

// Extension v0.3.0 shipped "/app/overview" as its dashboard link. That URL never resolved,
// because "overview" lands in the [project] slot. Published clients cannot be recalled, so the
// alias stays until that release is out of support.
export default function LegacyOverviewRedirect() {
  redirect(appRootPath());
}
