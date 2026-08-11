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

export const drawerFormSchema = connectProviderSchema.extend({
  endpoint: providerCredentialsSchema.shape.endpoint,
});

export type ConnectFormValues = z.infer<typeof drawerFormSchema>;

export function providerActionErrorNotice(error: unknown): Notice {
  if (isStaleDeploymentError(error)) {
    return {
      action: "refresh",
      message: actionErrorMessage(error),
      ok: false,
      title: "App update required",
      tone: "warning",
    };
  }
  return {
    message: actionErrorMessage(error, "Provider action failed."),
    ok: false,
    title: "Provider action failed",
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

export function testNotice(result: ProviderTestResult): Notice {
  return {
    balance: result.balance,
    message: result.message,
    ok: result.ok,
    title: result.ok ? "Connection test passed" : "Connection test failed",
  };
}
