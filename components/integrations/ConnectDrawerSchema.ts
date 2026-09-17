import type { ConnectProviderActionInput, ProviderTestResult } from "@/lib/integrations/types";
import {
  connectProviderSchema,
  providerCredentialsSchema,
  type TestProviderConnectionInput,
} from "@/lib/schemas/provider";
import { actionErrorMessage, isStaleDeploymentError } from "@/lib/ui/action-error";
import type { z } from "zod";

export type PendingAction = "cost" | "disconnect" | "save" | "test";
export type Notice = {
  action?: "refresh";
  balance?: number;
  message: string;
  ok?: boolean;
  title: string;
  tone?: "warning";
};

type DrawerNoticeCopy = {
  appUpdateRequired: string;
  connectionTestFailed: string;
  connectionTestPassed: string;
  providerActionFailed: string;
  providerActionFailedMessage: string;
};

const defaultDrawerNoticeCopy: DrawerNoticeCopy = {
  appUpdateRequired: "App update required",
  connectionTestFailed: "Connection test failed",
  connectionTestPassed: "Connection test passed",
  providerActionFailed: "Provider action failed",
  providerActionFailedMessage: "Provider action failed.",
};

export const drawerFormSchema = connectProviderSchema.extend({
  endpoint: providerCredentialsSchema.shape.endpoint,
});

export type ConnectFormValues = z.infer<typeof drawerFormSchema>;

export function providerActionErrorNotice(error: unknown, copy = defaultDrawerNoticeCopy): Notice {
  if (isStaleDeploymentError(error)) {
    return {
      action: "refresh",
      message: actionErrorMessage(error),
      ok: false,
      title: copy.appUpdateRequired,
      tone: "warning",
    };
  }
  return {
    message: actionErrorMessage(error, copy.providerActionFailedMessage),
    ok: false,
    title: copy.providerActionFailed,
  };
}

function plausibleCredentials(values: ConnectFormValues) {
  return {
    ...(values.secret ? { apiKey: values.secret } : {}),
    ...(values.endpoint ? { endpoint: values.endpoint } : {}),
    ...(values.login ? { login: values.login } : {}),
  };
}

export function connectInput(values: ConnectFormValues): ConnectProviderActionInput {
  const base = {
    // Drawer rate edits are persisted per feature, outside the credential form.
    costPerCheck: undefined,
    projectId: values.projectId,
    providerId: values.providerId,
  };
  if (values.providerId === "plausible") {
    return {
      ...base,
      credentials: plausibleCredentials(values),
    };
  }
  return { ...base, login: values.login, secret: values.secret };
}

export function testInput(values: ConnectFormValues): TestProviderConnectionInput {
  if (values.providerId === "plausible") {
    return {
      credentials: plausibleCredentials(values),
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

export function testNotice(result: ProviderTestResult, copy = defaultDrawerNoticeCopy): Notice {
  return {
    balance: result.balance,
    message: result.message,
    ok: result.ok,
    title: result.ok ? copy.connectionTestPassed : copy.connectionTestFailed,
  };
}
