"use client";
import type { ComponentProps, ReactNode } from "react";
import { OssAdministration } from "./OssAdministration";
import { OssAudit } from "./OssAudit";
import { OssEmailAllowance } from "./OssEmailAllowance";
import { OssOperationalDetails } from "./OssOperationalDetails";
import { OssRecovery } from "./OssRecovery";
import { OverviewInstance } from "./OverviewInstance";
import type { ossNavigation } from "./PreviewShell";

export type OssAdminData = {
  operations: ComponentProps<typeof OssOperationalDetails> | null;
  emailAllowance: ComponentProps<typeof OssEmailAllowance> | null;
  recovery: ComponentProps<typeof OssRecovery> | null;
  administration: ComponentProps<typeof OssAdministration> | null;
  audit: ComponentProps<typeof OssAudit> | null;
};
export type OssAdminView = (typeof ossNavigation)[keyof typeof ossNavigation][number];
export function unavailable(): ReactNode {
  return (
    <p role="status" className="text-sm text-fg-muted">
      Instance data is unavailable.
    </p>
  );
}
export function renderOssView(view: string, data: OssAdminData): ReactNode | null {
  switch (view) {
    case "Status":
      return data.operations ? (
        <OverviewInstance
          operations={{
            ...data.operations,
            emailAllowance: data.emailAllowance?.allowance ?? data.operations.emailAllowance,
          }}
        />
      ) : (
        unavailable()
      );
    case "Worker":
    case "Checks":
    case "Data sources":
    case "Notifications":
      return data.operations ? (
        <OssOperationalDetails {...data.operations} view={view} />
      ) : (
        unavailable()
      );
    case "Tasks":
      return data.recovery ? <OssRecovery {...data.recovery} /> : unavailable();
    case "Sending today":
      return data.emailAllowance ? <OssEmailAllowance {...data.emailAllowance} /> : unavailable();
    case "Accounts":
      return data.administration ? (
        <OssAdministration {...data.administration} section="accounts" />
      ) : (
        unavailable()
      );
    case "Settings":
      return data.administration ? (
        <OssAdministration {...data.administration} section="email" />
      ) : (
        unavailable()
      );
    case "Audit":
      return data.audit ? <OssAudit {...data.audit} /> : unavailable();
    default:
      return null;
  }
}
