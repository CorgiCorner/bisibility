import { z } from "zod";
import type {
  MigrationCompatibilityResult,
  MigrationDirection,
} from "./MigrateToCloudWizard.types";

const migrationTokenSchema = z.object({
  targetOrigin: z.string().trim(),
  token: z.string().trim().min(20, "Paste the migration token from the destination.").max(256),
});
export const COMPATIBILITY_TTL_MS = 5 * 60_000;

export function advanceOnSuccess(result: Promise<boolean>, advance: () => void) {
  result
    .then((ok) => {
      if (ok) advance();
    })
    .catch(() => undefined);
}

export function isFreshCompatibility(
  result: MigrationCompatibilityResult | null,
  contextKey: string,
) {
  return Boolean(
    result?.contextKey === contextKey &&
      Date.now() - new Date(result.checkedAt).getTime() <= COMPATIBILITY_TTL_MS,
  );
}

function isOriginLike(raw: string) {
  try {
    const url = new URL(raw);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

export function migrationWizardSchema(direction: MigrationDirection) {
  return migrationTokenSchema.superRefine((value, ctx) => {
    if (!value.targetOrigin.trim()) {
      ctx.addIssue({
        code: "custom",
        message:
          direction === "to-cloud" ? "Enter the destination URL." : "Enter the self-host URL.",
        path: ["targetOrigin"],
      });
      return;
    }
    if (!isOriginLike(value.targetOrigin)) {
      ctx.addIssue({
        code: "custom",
        message: "Use an origin like https://rank.example.com.",
        path: ["targetOrigin"],
      });
    }
  });
}

export function continueHintFor({
  exported,
  hasCompatibilityBlockers,
  mustCheckCompatibility,
  mustChooseDoneHold,
  mustCompletePushTransfer,
  mustConfirmDownload,
}: {
  exported: boolean;
  hasCompatibilityBlockers: boolean;
  mustCheckCompatibility: boolean;
  mustChooseDoneHold: boolean;
  mustCompletePushTransfer: boolean;
  mustConfirmDownload: boolean;
}) {
  if (mustCheckCompatibility) return "Run compatibility check first";
  if (hasCompatibilityBlockers) return "Resolve compatibility blockers first";
  if (mustCompletePushTransfer) return "Complete the transfer first";
  if (mustConfirmDownload) {
    return exported ? "Confirm the destination upload first" : "Export the package first";
  }
  return mustChooseDoneHold ? "Choose keep read-only or cancel the migration below" : null;
}
