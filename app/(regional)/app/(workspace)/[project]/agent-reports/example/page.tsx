import {
  AgentReportBack,
  AgentReportDetailFrame,
  AgentReportHeader,
} from "@/components/agent-reports/AgentReportDetailLayout";
import { ChallengeReportView } from "@/components/challenge-report/ChallengeReportView";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { sampleChallengeBody } from "@/lib/challenge-report/fixtures";
import { requireReadableProject } from "@/lib/queries/_auth";
import { appPath } from "@/lib/routing/app-path";

export default async function ExampleReportPage({
  params,
}: Readonly<{ params: Promise<{ project: string }> }>) {
  const [{ project }, runtime] = await Promise.all([params, resolveRegionalDocumentLocale()]);
  await requireReadableProject(project);
  const messages = await loadCoreMessages(runtime.locale, [
    "agentWorkspace",
    "challengeReport",
    "shared",
  ]);
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <AgentReportDetailFrame>
        <AgentReportBack
          href={appPath(project, "agent-reports")}
          label={t("agentWorkspace.back")}
        />
        <AgentReportHeader
          title={t("challengeReport.exampleReport")}
          kind={t("challengeReport.exampleData")}
          share={null}
        />
        <ChallengeReportView body={sampleChallengeBody()} />
      </AgentReportDetailFrame>
    </FeatureMessagesProvider>
  );
}
