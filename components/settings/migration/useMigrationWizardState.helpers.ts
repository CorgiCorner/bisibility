import type { useTranslations } from "next-intl";
import { z } from "zod";
import type {
  MigrationCompatibilityResult,
  MigrationDirection,
} from "./MigrateToCloudWizard.types";

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

type MigrationWizardTranslator = ReturnType<
  typeof useTranslations<"projectSettingsMigration.wizard">
>;

export function migrationWizardSchema(direction: MigrationDirection, t: MigrationWizardTranslator) {
  return z
    .object({
      targetOrigin: z.string().trim(),
      token: z.string().trim().min(20, t("validation.token")).max(256),
    })
    .superRefine((value, ctx) => {
      if (!value.targetOrigin.trim()) {
        ctx.addIssue({
          code: "custom",
          message:
            direction === "to-cloud" ? t("validation.destination") : t("validation.selfHost"),
          path: ["targetOrigin"],
        });
        return;
      }
      if (!isOriginLike(value.targetOrigin)) {
        ctx.addIssue({
          code: "custom",
          message: t("validation.origin"),
          path: ["targetOrigin"],
        });
      }
    });
}

export function continueHintFor(
  t: MigrationWizardTranslator,
  {
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
  },
) {
  if (mustCheckCompatibility) return t("gate.checkFirst");
  if (hasCompatibilityBlockers) return t("gate.blockersFirst");
  if (mustCompletePushTransfer) return t("gate.transferFirst");
  if (mustConfirmDownload) {
    return exported ? t("gate.confirmUploadFirst") : t("gate.exportFirst");
  }
  return mustChooseDoneHold ? t("gate.chooseHold") : null;
}
