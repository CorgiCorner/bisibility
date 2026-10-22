import { ComparisonSelectionControl } from "@/components/dashboard-competitors/ComparisonSelectionControl";
import { LocalSubjectControl } from "@/components/dashboard-local/LocalSubjectControl";
import { OverviewToolbar } from "@/components/overview/OverviewToolbar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import type { loadDashboardPersonalContext } from "@/lib/queries/dashboard-personal-context";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { MapPinIcon as MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import Link from "next/link";
import { PersonalDashboardSurface } from "./PersonalDashboardSurface";

export async function DashboardScopeUnavailable({
  personal,
}: {
  personal: Awaited<ReturnType<typeof loadDashboardPersonalContext>>;
}) {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["shared", "projectDashboard"]);
  const t = createIntlTranslator(runtime.locale, messages.shared.dashboardLayout, runtime);
  const localT = createIntlTranslator(
    runtime.locale,
    messages.projectDashboard.localReport,
    runtime,
  );
  const projectRef = asProjectRef(personal.preference.projectId);
  const local = personal.local;
  const needsSetup = local && local.choices.length === 0;
  const description = t(
    personal.invalidPreset
      ? "invalidPreset"
      : personal.composition.layout.preset === "local"
        ? "reasons.missing_local_subject"
        : "reasons.missing_competitor_scope",
  );
  return (
    <PersonalDashboardSurface
      key={personal.scopeKey}
      access={personal.access}
      preference={personal.preference}
      layout={personal.composition.layout}
      widgets={{}}
      integratedToolbar
      emptyState={
        !local && personal.comparison ? (
          <ComparisonSelectionControl
            comparison={personal.comparison}
            preference={personal.preference}
            standalone
          />
        ) : (
          <EmptyState
            title={local ? localT(needsSetup ? "setupTitle" : "choose") : t("presets.competitors")}
            description={
              local ? localT(needsSetup ? "setupDescription" : "chooseDescription") : description
            }
            icon={local ? <MapPin weight="regular" size={24} aria-hidden /> : undefined}
            action={
              local ? (
                needsSetup ? (
                  <Button asChild size="sm">
                    <Link href={appPath(projectRef, "settings", "business-locations")}>
                      {localT("manageLocations")}
                    </Link>
                  </Button>
                ) : (
                  <LocalSubjectControl
                    local={local}
                    preference={personal.preference}
                    showStateDescription={false}
                  />
                )
              ) : undefined
            }
          />
        )
      }
      shell={{
        scope: (
          <OverviewToolbar canCreateKeyword={false} placement="inline" projectRef={projectRef} />
        ),
        mode: <p>{t("presentationOnly")}</p>,
        health: <p>{t("shellUnavailable")}</p>,
        budget: <p>{t("budgetUnknown")}</p>,
        coverage: <p>{t("scopeNotMeasured")}</p>,
      }}
    />
  );
}
