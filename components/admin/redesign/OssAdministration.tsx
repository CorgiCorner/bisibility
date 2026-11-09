"use client";
import { AdminAccountActions } from "@/components/admin/AdminAccountActions";
import { AdminAccountLookupForm } from "@/components/admin/AdminAccountLookup";
import { DangerousActionAccessProvider } from "@/components/admin/DangerousActionGate";
import { AppDrawer } from "@/components/ui/AppDrawer";
import { Card } from "@/components/ui/Card";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { IdChip } from "@/components/ui/IdChip";
import type {
  AdminAccountsState,
  AdminAccountView as PreviewAccount,
} from "@/lib/ops/admin-account-view";
import { useTranslations } from "next-intl";
import { type ComponentProps, type ReactNode, useState } from "react";
import { type AccountListControls, OssAccountsTable } from "./OssAccountsTable";
import { OssInstanceMailForm } from "./OssEmailAllowance";

type BaseAccountAction = NonNullable<ComponentProps<typeof AdminAccountActions>["onAction"]>;
type AccountActionHandler = (
  action: Parameters<BaseAccountAction>[0],
  userId: string,
) => ReturnType<BaseAccountAction>;

export type { AdminAccountView as PreviewAccount } from "@/lib/ops/admin-account-view";

function AccountDetails({
  account,
  busy,
  twoFactorEnabled,
  onAccountAction,
  onStatusChange,
  extension,
}: {
  account: PreviewAccount;
  extension?: ReactNode;
  busy: boolean;
  onStatusChange: (status: PreviewAccount["status"]) => void;
  twoFactorEnabled: boolean;
  onAccountAction: AccountActionHandler;
}) {
  const t = useTranslations("instanceAdmin.accounts");
  const [status, setStatus] = useState(account.status);
  const facts = [
    [t("created"), account.created],
    [t("lastActive"), account.lastActive],
    [t("projects"), account.projects ?? t("notReported")],
    [t("keywords"), account.keywords ?? t("notReported")],
    [t("connections"), account.connections],
  ];
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm">
        {account.email} · {account.id} · {t(`statuses.${status}`)}
      </p>
      <IdChip value={account.id} copyLabel={t("copyId")} size="sm" />
      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-fg-muted">{label}</dt>
            <dd className="m-0">{value}</dd>
          </div>
        ))}
      </dl>
      {extension}
      <DangerousActionAccessProvider allowed={twoFactorEnabled}>
        <AdminAccountActions
          userId={account.id}
          status={status}
          busy={busy}
          onAction={(action) => onAccountAction(action, account.id)}
          onStatusChange={(next) => {
            setStatus(next);
            onStatusChange(next);
          }}
        />
      </DangerousActionAccessProvider>
    </div>
  );
}

export function OssAdministration({
  account,
  accounts = [],
  accountTotalCount,
  accountsState = "ready",
  accountColumns,
  accountListKey,
  accountList,
  accountDetails,
  drawerOpen,
  onCloseDrawer,
  onOpenAccount,
  isAdmin = true,
  twoFactorEnabled = true,
  busy = false,
  error,
  onLookup,
  onAccountAction,
  onSaveMail,
  onClearMail,
  mailSettings,
  mailerConfigured,
  section = "all",
}: {
  account: PreviewAccount | null;
  accounts?: PreviewAccount[];
  accountTotalCount?: number;
  accountsState?: AdminAccountsState;
  accountColumns?: DataTableColumn<PreviewAccount>[];
  accountListKey?: string;
  accountList?: AccountListControls;
  accountDetails?: (account: PreviewAccount) => ReactNode;
  drawerOpen?: boolean;
  onCloseDrawer?: () => void;
  onOpenAccount?: (id: string) => void;
  isAdmin?: boolean;
  twoFactorEnabled?: boolean;
  busy?: boolean;
  error?: string;
  onLookup: (query: string) => void;
  onAccountAction: AccountActionHandler;
  onSaveMail: ComponentProps<typeof OssInstanceMailForm>["onSaveMail"];
  onClearMail: ComponentProps<typeof OssInstanceMailForm>["onClearMail"];
  mailSettings?: ComponentProps<typeof OssInstanceMailForm>["settings"];
  mailerConfigured?: boolean;
  section?: "all" | "accounts" | "email";
}) {
  const t = useTranslations("instanceAdmin.accounts");
  const [statuses, setStatuses] = useState<Record<string, PreviewAccount["status"]>>({});
  const resolveStatus = (row: PreviewAccount) => ({
    ...row,
    status: statuses[row.id] ?? row.status,
  });
  const updateStatus = (id: string, status: PreviewAccount["status"]) =>
    setStatuses((current) => ({ ...current, [id]: status }));
  const [searched, setSearched] = useState(false);
  const [listed, setListed] = useState<PreviewAccount | null>(null);
  const listedDetail =
    drawerOpen !== undefined
      ? account
      : accountList
        ? account?.id === listed?.id
          ? account
          : null
        : account?.id === listed?.id
          ? account
          : listed;
  if (!isAdmin) return <p role="status">{t("adminRequired")}</p>;
  return (
    <div className="grid min-w-0 gap-4" aria-busy={busy}>
      {error && <p role="alert">{error}</p>}
      {section !== "email" && (
        <OssAccountsTable
          key={accountListKey}
          accounts={accounts.map(resolveStatus)}
          server={accountList}
          totalCount={accountTotalCount}
          state={accountsState}
          busy={busy}
          additionalColumns={accountColumns}
          onLookup={(query) => {
            if (onOpenAccount) {
              onOpenAccount(query);
              return;
            }
            setListed(accounts.find((item) => item.id === query) ?? null);
            onLookup(query);
          }}
        />
      )}
      {section !== "email" && (
        <Card
          data-testid="oss-account-lookup"
          component="section"
          size="lg"
          aria-labelledby="oss-account-heading"
        >
          <h3 id="oss-account-heading" className="text-sm font-semibold">
            {t("find")}
          </h3>
          <AdminAccountLookupForm
            busy={busy}
            onSubmit={({ identifier }) => {
              setSearched(true);
              onLookup(identifier);
            }}
          />
          {searched && !account && !busy && !error && (
            <p className="mt-3 text-sm text-fg-muted">{t("notFound")}</p>
          )}
          {account && !drawerOpen && (
            <AccountDetails
              key={`${account.id}:${account.status}`}
              account={resolveStatus(account)}
              extension={accountDetails?.(account)}
              onStatusChange={(status) => updateStatus(account.id, status)}
              busy={busy}
              twoFactorEnabled={twoFactorEnabled}
              onAccountAction={onAccountAction}
            />
          )}
        </Card>
      )}
      <AppDrawer
        open={drawerOpen ?? listed !== null}
        onClose={onCloseDrawer ?? (() => setListed(null))}
        title={t("details")}
        autoFocusClose
      >
        {accountList && busy && <p role="status">{t("loading")}</p>}
        {accountList && error && <p role="alert">{error}</p>}
        {accountList && !busy && !error && !listedDetail && <p role="status">{t("notFound")}</p>}
        {listedDetail && (
          <AccountDetails
            key={listedDetail.id}
            account={resolveStatus(listedDetail)}
            extension={accountDetails?.(listedDetail)}
            onStatusChange={(status) => updateStatus(listedDetail.id, status)}
            busy={busy}
            twoFactorEnabled={twoFactorEnabled}
            onAccountAction={onAccountAction}
          />
        )}
      </AppDrawer>
      {section !== "accounts" && (
        <OssInstanceMailForm
          busy={busy}
          onClearMail={onClearMail}
          onSaveMail={onSaveMail}
          twoFactorEnabled={twoFactorEnabled}
          settings={mailSettings}
          mailerConfigured={mailerConfigured}
        />
      )}
    </div>
  );
}
