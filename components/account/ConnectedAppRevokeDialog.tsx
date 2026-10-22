"use client";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { revokeConnectedAppSchema } from "@/lib/schemas/connected-app";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import type { ConnectedAppsSectionProps } from "./ConnectedAppsSection";

export function ConnectedAppRevokeDialog({
  app,
  onClose,
  revokeApp,
}: Readonly<{
  app: ConnectedAppsSectionProps["apps"][number];
  onClose: () => void;
  revokeApp: ConnectedAppsSectionProps["revokeApp"];
}>) {
  const t = useTranslations("account.security.connectedApps");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const { register, handleSubmit } = useForm<z.infer<typeof revokeConnectedAppSchema>>({
    defaultValues: { clientId: app.clientId, revokeCreatedTokens: false },
    resolver: zodResolver(revokeConnectedAppSchema),
  });
  const submit = handleSubmit((data) => {
    setFailed(false);
    startTransition(async () => {
      try {
        await revokeApp(app.clientId, { revokeCreatedTokens: data.revokeCreatedTokens });
        router.refresh();
        onClose();
      } catch {
        setFailed(true);
      }
    });
  });
  return (
    <Modal
      open
      title={t("confirmTitle", { name: app.name })}
      onClose={onClose}
      dismissDisabled={pending}
      footer={
        <>
          <Button size="sm" variant="ghost" disabled={pending} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            loading={pending}
            loadingLabel={t("revoking")}
            disabled={pending}
            onClick={() => void submit()}
          >
            {t("revoke")}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="m-0 text-[13px] text-fg-muted">{t("confirmDescription")}</p>
        <p className="m-0 text-[13px]">{t("issuedAccess")}</p>
        {app.createdTokens.length ? (
          <Checkbox
            {...register("revokeCreatedTokens")}
            disabled={pending}
            label={t("alsoRevoke", { count: app.createdTokens.length })}
          />
        ) : null}
        <p className="m-0 text-[12px] text-fg-muted">
          {t("unlinkedTokens")}{" "}
          <a className="text-accent-text underline" href="/app/account/security#personal-tokens">
            {t("manageTokens")}
          </a>
        </p>
        {failed ? (
          <p role="alert" className="text-[12px] text-red-text">
            {t("error")}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
