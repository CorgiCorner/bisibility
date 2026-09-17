import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { AppLocale } from "@/i18n/config";
import { DEFAULT_TIME_ZONE, type IntlTranslationContext } from "@/i18n/formats";
import type { DateFormat } from "@/lib/dates/format";
import type { Queries, queries } from "@testing-library/dom";
import { type RenderOptions, type RenderResult, render } from "@testing-library/react";
import type { AbstractIntlMessages } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import {
  accountFeatureTestMessages,
  advancedSettingsFeatureTestMessages,
  alertsFeatureTestMessages,
  auditFeatureTestMessages,
  authFeatureTestMessages,
  backlinksFeatureTestMessages,
  cloudImportFeatureTestMessages,
  competitorsFeatureTestMessages,
  costEstimateFeatureTestMessages,
  developersSettingsFeatureTestMessages,
  domainOverviewFeatureTestMessages,
  emailPreferencesFeatureTestMessages,
  experimentalSettingsFeatureTestMessages,
  generalSettingsFeatureTestMessages,
  gettingStartedFeatureTestMessages,
  installFeatureTestMessages,
  instanceAdminFeatureTestMessages,
  integrationsFeatureTestMessages,
  inviteFeatureTestMessages,
  keywordManagementFeatureTestMessages,
  notificationSettingsFeatureTestMessages,
  onboardingFeatureTestMessages,
  projectMarketsFeatureTestMessages,
  projectRankTrackerFeatureTestMessages,
  projectRunsFeatureTestMessages,
  researchFeatureTestMessages,
  searchInsightsFeatureTestMessages,
  settingsShellFeatureTestMessages,
  setupFeatureTestMessages,
  sharedControlTestMessages,
  shellFeatureTestMessages,
  shellProjectRankTrackerFeatureTestMessages,
  teamSettingsFeatureTestMessages,
  timelineFeatureTestMessages,
  trackingSettingsFeatureTestMessages,
  usageSettingsFeatureTestMessages,
} from "./feature-test-messages";

type RenderContainer = Element | Document | DocumentFragment;

type FeatureRenderOptions<
  Q extends Queries = typeof queries,
  Container extends RenderContainer = HTMLElement,
  BaseElement extends RenderContainer = Container,
> = RenderOptions<Q, Container, BaseElement> & {
  dateFormat?: DateFormat;
  locale?: AppLocale;
  messages: AbstractIntlMessages;
  timeZone?: IntlTranslationContext["timeZone"];
};

type FeatureMessagesOptions = Pick<
  FeatureRenderOptions,
  "dateFormat" | "locale" | "messages" | "timeZone"
>;
type SharedMessagesOptions = Omit<FeatureMessagesOptions, "messages">;
type SharedRenderOptions = Omit<FeatureRenderOptions, "messages">;

export {
  accountFeatureTestMessages,
  advancedSettingsFeatureTestMessages,
  alertsFeatureTestMessages,
  auditFeatureTestMessages,
  authFeatureTestMessages,
  backlinksFeatureTestMessages,
  cloudImportFeatureTestMessages,
  competitorsFeatureTestMessages,
  costEstimateFeatureTestMessages,
  developersSettingsFeatureTestMessages,
  domainOverviewFeatureTestMessages,
  emailPreferencesFeatureTestMessages,
  experimentalSettingsFeatureTestMessages,
  generalSettingsFeatureTestMessages,
  gettingStartedFeatureTestMessages,
  installFeatureTestMessages,
  instanceAdminFeatureTestMessages,
  integrationsFeatureTestMessages,
  inviteFeatureTestMessages,
  keywordManagementFeatureTestMessages,
  notificationSettingsFeatureTestMessages,
  onboardingFeatureTestMessages,
  projectMarketsFeatureTestMessages,
  projectRankTrackerFeatureTestMessages,
  projectRunsFeatureTestMessages,
  researchFeatureTestMessages,
  searchInsightsFeatureTestMessages,
  settingsShellFeatureTestMessages,
  setupFeatureTestMessages,
  sharedControlTestMessages,
  shellFeatureTestMessages,
  shellProjectRankTrackerFeatureTestMessages,
  teamSettingsFeatureTestMessages,
  timelineFeatureTestMessages,
  trackingSettingsFeatureTestMessages,
  usageSettingsFeatureTestMessages,
};

/** Creates the real scoped provider for static server-render tests. */
export function featureMessagesElement(
  children: ReactNode,
  {
    dateFormat = "month_first",
    locale = "en",
    messages,
    timeZone = DEFAULT_TIME_ZONE,
  }: FeatureMessagesOptions,
) {
  return (
    <FeatureMessagesProvider locale={locale} messages={messages} timeZone={timeZone}>
      <DateFormatProvider value={dateFormat}>
        <DateDisplayProvider>{children}</DateDisplayProvider>
      </DateFormatProvider>
    </FeatureMessagesProvider>
  );
}

export function sharedMessagesElement(
  children: ReactNode,
  {
    dateFormat = "month_first",
    locale = "en",
    timeZone = DEFAULT_TIME_ZONE,
  }: SharedMessagesOptions = {},
) {
  return featureMessagesElement(children, {
    dateFormat,
    locale,
    messages: sharedControlTestMessages,
    timeZone,
  });
}

export function searchInsightsMessagesElement(
  children: ReactNode,
  {
    dateFormat = "month_first",
    locale = "en",
    timeZone = DEFAULT_TIME_ZONE,
  }: SharedMessagesOptions = {},
) {
  return featureMessagesElement(children, {
    dateFormat,
    locale,
    messages: searchInsightsFeatureTestMessages,
    timeZone,
  });
}

export function shellMessagesElement(children: ReactNode, options: SharedMessagesOptions = {}) {
  return featureMessagesElement(children, { ...options, messages: shellFeatureTestMessages });
}

/** Renders real, explicitly scoped messages without manufacturing absent keys. */
export function renderWithFeatureMessages<
  Q extends Queries = typeof queries,
  Container extends RenderContainer = HTMLElement,
  BaseElement extends RenderContainer = Container,
>(
  ui: ReactElement,
  {
    dateFormat = "month_first",
    locale = "en",
    messages,
    timeZone = DEFAULT_TIME_ZONE,
    wrapper: Wrapper,
    ...options
  }: FeatureRenderOptions<Q, Container, BaseElement>,
): RenderResult<Q, Container, BaseElement> {
  function FeatureTestProvider({ children }: Readonly<{ children: ReactNode }>) {
    return featureMessagesElement(Wrapper ? <Wrapper>{children}</Wrapper> : children, {
      dateFormat,
      locale,
      messages,
      timeZone,
    });
  }

  return render<Q, Container, BaseElement>(ui, { ...options, wrapper: FeatureTestProvider });
}

function renderWithScopedMessages(
  ui: ReactElement,
  messages: AbstractIntlMessages,
  options: SharedRenderOptions = {},
) {
  return renderWithFeatureMessages(ui, { ...options, messages });
}

export const renderWithSharedMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, sharedControlTestMessages, options);
export const renderWithAccountMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, accountFeatureTestMessages, options);
export const renderWithAlertMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, alertsFeatureTestMessages, options);
export const renderWithAuditMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, auditFeatureTestMessages, options);
export const renderWithBacklinksMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, backlinksFeatureTestMessages, options);
export const renderWithCloudImportMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, cloudImportFeatureTestMessages, options);
export const renderWithCompetitorsMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, competitorsFeatureTestMessages, options);
export const renderWithCostEstimateMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, costEstimateFeatureTestMessages, options);
export const renderWithDevelopersSettingsMessages = (
  ui: ReactElement,
  options?: SharedRenderOptions,
) => renderWithScopedMessages(ui, developersSettingsFeatureTestMessages, options);
export const renderWithDomainOverviewMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, domainOverviewFeatureTestMessages, options);
export const renderWithEmailPreferencesMessages = (
  ui: ReactElement,
  options?: SharedRenderOptions,
) => renderWithScopedMessages(ui, emailPreferencesFeatureTestMessages, options);
export const renderWithExperimentalSettingsMessages = (
  ui: ReactElement,
  options?: SharedRenderOptions,
) => renderWithScopedMessages(ui, experimentalSettingsFeatureTestMessages, options);
export const renderWithGeneralSettingsMessages = (
  ui: ReactElement,
  options?: SharedRenderOptions,
) => renderWithScopedMessages(ui, generalSettingsFeatureTestMessages, options);
export const renderWithGettingStartedMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, gettingStartedFeatureTestMessages, options);
export const renderWithInstallMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, installFeatureTestMessages, options);
export const renderWithInstanceAdminMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, instanceAdminFeatureTestMessages, options);
export const renderWithIntegrationMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, integrationsFeatureTestMessages, options);
export const renderWithInviteMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, inviteFeatureTestMessages, options);
export const renderWithNotificationSettingsMessages = (
  ui: ReactElement,
  options?: SharedRenderOptions,
) => renderWithScopedMessages(ui, notificationSettingsFeatureTestMessages, options);
export const renderWithOnboardingMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, onboardingFeatureTestMessages, options);
export const renderWithKeywordManagementMessages = (
  ui: ReactElement,
  options?: SharedRenderOptions,
) => renderWithScopedMessages(ui, keywordManagementFeatureTestMessages, options);
export const renderWithProjectMarketsMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, projectMarketsFeatureTestMessages, options);
export const renderWithProjectRankTrackerMessages = (
  ui: ReactElement,
  options?: SharedRenderOptions,
) => renderWithScopedMessages(ui, projectRankTrackerFeatureTestMessages, options);
export const renderWithProjectRunsMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, projectRunsFeatureTestMessages, options);
export const renderWithResearchMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, researchFeatureTestMessages, options);
export const renderWithSearchInsightsMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, searchInsightsFeatureTestMessages, options);
export const renderWithSettingsShellMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, settingsShellFeatureTestMessages, options);
export const renderWithShellMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, shellFeatureTestMessages, options);
export const renderWithShellProjectRankTrackerMessages = (
  ui: ReactElement,
  options?: SharedRenderOptions,
) => renderWithScopedMessages(ui, shellProjectRankTrackerFeatureTestMessages, options);
export const renderWithTeamSettingsMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, teamSettingsFeatureTestMessages, options);
export const renderWithTimelineMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, timelineFeatureTestMessages, options);
export const renderWithTrackingSettingsMessages = (
  ui: ReactElement,
  options?: SharedRenderOptions,
) => renderWithScopedMessages(ui, trackingSettingsFeatureTestMessages, options);
export const renderWithUsageSettingsMessages = (ui: ReactElement, options?: SharedRenderOptions) =>
  renderWithScopedMessages(ui, usageSettingsFeatureTestMessages, options);
export const renderWithAdvancedSettingsMessages = (
  ui: ReactElement,
  options?: SharedRenderOptions,
) => renderWithScopedMessages(ui, advancedSettingsFeatureTestMessages, options);
