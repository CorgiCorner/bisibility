"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const serverOrigin = () => "";
const clientOrigin = () => window.location.origin;

export function ReportShare({ path }: Readonly<{ path: string }>) {
  const t = useTranslations("agentWorkspace");
  const origin = useSyncExternalStore(subscribe, clientOrigin, serverOrigin);
  return <CopyButton disabled={!origin} label={t("copyLink")} text={`${origin}${path}`} />;
}
