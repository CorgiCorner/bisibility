import {
  credentialFieldIssueMessage,
  credentialFieldsSignature,
  hasRequiredCredentialFields,
  missingCredentialFields,
} from "@/components/integrations/provider-credentials";
import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
  onboardingDefaults,
} from "@/components/onboarding/onboarding-fixtures";
import { dollarsToCents } from "@/lib/format/currency";
import {
  DATAFORSEO_CREDENTIAL_FIELDS,
  SERPAPI_CREDENTIAL_FIELDS,
} from "@/lib/integrations/credential-fields";
import { connectProviderSchema, type TestProviderConnectionInput } from "@/lib/schemas/provider";
import { z } from "zod";

export type OnboardingSerpProviderId = "dataforseo" | "serpapi";
export type CredentialField = {
  label: string;
  name: "login" | "secret";
  placeholder: string;
  type?: "password" | "text";
};
type ProviderOption = {
  /** Marks the credentials link as a paid affiliate destination (rel + disclosure). */
  affiliate?: boolean;
  costCaption: string;
  costDetail: string;
  docsHref: string;
  label: string;
  value: OnboardingSerpProviderId;
};
export const providerOptions = [
  {
    affiliate: true,
    costCaption: "Pay per check - from ~$0.002",
    costDetail:
      "Billed in USD at your configured depth - about $0.002 at Top 10 and $0.0155 at Top 100.",
    docsHref: "https://dataforseo.com/?aff=205409",
    label: "DataForSEO",
    value: "dataforseo",
  },
  {
    affiliate: false,
    costCaption: "Plan-based - monthly search quota",
    costDetail:
      "Plans include monthly searches; one Top-N check uses up to ceil(N/10) searches, usually fewer with stop-on-match.",
    docsHref: "https://serpapi.com",
    label: "SerpApi",
    value: "serpapi",
  },
] as const satisfies readonly ProviderOption[];
export const credentialFields = {
  dataforseo: DATAFORSEO_CREDENTIAL_FIELDS,
  serpapi: SERPAPI_CREDENTIAL_FIELDS,
} satisfies Record<OnboardingSerpProviderId, readonly CredentialField[]>;
export const connectionTestFailedMessage =
  "Connection test failed - fix the credentials, or skip and add keywords as paused.";
const serpProviderIdSchema = z.enum(["dataforseo", "serpapi"]);
const costPerCheckSchema = z.preprocess(
  (value) =>
    value === "" || (typeof value === "number" && Number.isNaN(value)) ? undefined : value,
  z.coerce
    .number()
    .min(0)
    .max(100)
    .refine((value) => Number.isInteger(value * 10000), "Use up to 4 decimals.")
    .optional(),
);
const onboardingConnectProviderBaseSchema = connectProviderSchema.extend({
  costPerCheck: costPerCheckSchema,
  providerId: serpProviderIdSchema,
});
export function onboardingConnectProviderSchemaForConnections(connections: ConnectedProviderMap) {
  return onboardingConnectProviderBaseSchema.superRefine((value, ctx) => {
    if (connections[value.providerId]) return;
    for (const field of missingCredentialFields(credentialFields[value.providerId], value)) {
      ctx.addIssue({
        code: "custom",
        message: credentialFieldIssueMessage(field),
        path: [field.name],
      });
    }
  });
}
export const onboardingConnectProviderSchema = onboardingConnectProviderSchemaForConnections({});
export type OnboardingConnectProviderInput = z.infer<typeof onboardingConnectProviderSchema>;
export type ProviderTestResult = {
  balance?: number;
  message: string;
  ok: boolean;
};
export type ConnectedProvider = { balance?: number; primary: boolean };
export type ConnectedProviderMap = Partial<Record<OnboardingSerpProviderId, ConnectedProvider>>;
export type ProviderTestResultMap = Partial<
  Record<OnboardingSerpProviderId, ProviderTestResult | null>
>;
export type ProviderDraft = Pick<
  OnboardingConnectProviderInput,
  "costPerCheck" | "login" | "secret"
>;
export type ProviderDraftMap = Record<OnboardingSerpProviderId, ProviderDraft>;
export type TestedCredentialKeyMap = Partial<Record<OnboardingSerpProviderId, string>>;
export function providerTestInput(
  values: OnboardingConnectProviderInput,
): TestProviderConnectionInput {
  if (values.providerId === "serpapi") {
    return {
      credentials: { apiKey: values.credentials?.apiKey ?? values.secret },
      projectId: values.projectId,
      providerId: values.providerId,
    };
  }
  return {
    login: values.login,
    projectId: values.projectId,
    providerId: values.providerId,
    secret: values.secret,
  };
}
export function providerCredentialKey(
  providerId: OnboardingSerpProviderId,
  values: Pick<OnboardingConnectProviderInput, "credentials" | "login" | "secret">,
) {
  return credentialFieldsSignature(credentialFields[providerId], values);
}
export function currentProviderState(
  providerId: OnboardingSerpProviderId,
  values: Pick<OnboardingConnectProviderInput, "credentials" | "login" | "secret">,
  testResults: ProviderTestResultMap,
  testedCredentialKeys: TestedCredentialKeyMap,
) {
  const credentialKey = providerCredentialKey(providerId, values);
  return {
    testDisabled: !hasRequiredCredentialFields(credentialFields[providerId], values),
    testResult: testedCredentialKeys[providerId] === credentialKey ? testResults[providerId] : null,
  };
}
export function providerConnectInput(
  values: OnboardingConnectProviderInput,
): OnboardingConnectProviderInput {
  if (values.providerId === "serpapi") {
    return {
      ...values,
      credentials: { apiKey: values.credentials?.apiKey ?? values.secret },
      login: undefined,
      secret: undefined,
    };
  }
  return { ...values, credentials: undefined };
}

export function costOrEmpty(value: number | undefined) {
  return value && value > 0 ? value : undefined;
}

export function costPerCheckCentsFromUsd(usd: number | undefined): number | null {
  if (usd === undefined || !(usd > 0)) return null;
  return dollarsToCents(usd);
}

export function formDefaults(
  defaultValues: OnboardingConnectProviderInput | undefined,
  flowState: OnboardingFlowState | undefined,
): OnboardingConnectProviderInput {
  const providerId = defaultValues?.providerId === "serpapi" ? "serpapi" : "dataforseo";
  const secret =
    providerId === "serpapi"
      ? (defaultValues?.credentials?.apiKey ?? defaultValues?.secret ?? "")
      : (defaultValues?.secret ?? "");
  return {
    costPerCheck: costOrEmpty(defaultValues?.costPerCheck),
    login: providerId === "dataforseo" ? (defaultValues?.login ?? onboardingDefaults.apiLogin) : "",
    projectId: defaultValues?.projectId ?? flowState?.projectId ?? "",
    providerId,
    secret,
  };
}

export function pickDraft(values: OnboardingConnectProviderInput): ProviderDraft {
  return {
    costPerCheck: costOrEmpty(values.costPerCheck),
    login: values.login,
    secret: values.secret ?? values.credentials?.apiKey,
  };
}

export function providerValuesFromDraft(
  providerId: OnboardingSerpProviderId,
  currentValues: OnboardingConnectProviderInput,
  drafts: ProviderDraftMap,
): OnboardingConnectProviderInput {
  const draft =
    providerId === currentValues.providerId ? pickDraft(currentValues) : drafts[providerId];
  return {
    ...currentValues,
    ...draft,
    credentials: providerId === "serpapi" ? { apiKey: draft.secret } : undefined,
    providerId,
  };
}

export function providerSelectionState(
  values: OnboardingConnectProviderInput,
  providerId: OnboardingSerpProviderId,
  drafts: ProviderDraftMap,
) {
  const draft = values.providerId === providerId ? pickDraft(values) : drafts[providerId];
  return {
    drafts: { ...drafts, [values.providerId]: pickDraft(values) },
    values: { ...values, ...draft, providerId },
  };
}

export function withConnectedProvider(
  connections: ConnectedProviderMap,
  providerId: OnboardingSerpProviderId,
  balance: number | undefined,
  primary: boolean,
): ConnectedProviderMap {
  return { ...connections, [providerId]: { balance, primary } };
}

export function initialDrafts(defaultValues: OnboardingConnectProviderInput): ProviderDraftMap {
  return {
    dataforseo: {
      costPerCheck: undefined,
      login: onboardingDefaults.apiLogin,
      secret: "",
    },
    serpapi: { costPerCheck: undefined, login: "", secret: "" },
    [defaultValues.providerId]: pickDraft(defaultValues),
  };
}

export function primaryProvider(connections: ConnectedProviderMap) {
  return providerOptions.find((provider) => connections[provider.value]?.primary)?.value;
}

export function replaceSelectedProviderInUrl(
  flowState: OnboardingFlowState | undefined,
  projectId: string,
  providerId: OnboardingSerpProviderId,
) {
  window.history.replaceState(
    null,
    "",
    buildOnboardingStepHref(3, { ...flowState, projectId, providerId }),
  );
}

/** Preserves verified state only when restored credentials match the stored successful test. */
export function draftMatchesStoredTest(
  providerId: OnboardingSerpProviderId,
  draft: Pick<ProviderDraft, "login" | "secret">,
  testResult: ProviderTestResult | null | undefined,
  testedKey: string | undefined,
) {
  return (
    testResult?.ok === true &&
    testedKey !== undefined &&
    credentialFieldsSignature(credentialFields[providerId], {
      login: draft.login,
      secret: draft.secret,
    }) === testedKey
  );
}

export function anyProviderVerified(
  connections: ConnectedProviderMap,
  drafts: ProviderDraftMap,
  testResults: ProviderTestResultMap,
  testedCredentialKeys: TestedCredentialKeyMap,
  currentValues: OnboardingConnectProviderInput,
) {
  return (
    providerOptions.some(({ value: providerId }) => Boolean(connections[providerId])) ||
    verifiedProviderId(drafts, testResults, testedCredentialKeys, currentValues) !== undefined
  );
}

export function verifiedProviderId(
  drafts: ProviderDraftMap,
  testResults: ProviderTestResultMap,
  testedCredentialKeys: TestedCredentialKeyMap,
  currentValues: OnboardingConnectProviderInput,
) {
  return providerOptions.find(({ value: providerId }) =>
    draftMatchesStoredTest(
      providerId,
      providerValuesFromDraft(providerId, currentValues, drafts),
      testResults[providerId],
      testedCredentialKeys[providerId],
    ),
  )?.value;
}
