"use client";
import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import { Card } from "@/components/ui/Card";
import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import Link from "next/link";
import { useTranslations } from "next-intl";

export type AiResearchHistoryEntry = {
  id: string;
  title: string;
  createdAt: string;
  originalPayment?: ActionPaymentReceipt;
};
export function AiResearchHistory({
  history,
  projectId,
}: {
  history: AiResearchHistoryEntry[];
  projectId: string;
}) {
  const t = useTranslations("projectAiResearch");
  return (
    <Card>
      <h2 className="text-ui-body font-semibold">{t("recentReports")}</h2>
      {history.length ? (
        <div className="mt-3 grid gap-3">
          {history.map((report) => (
            <Link
              key={report.id}
              href={`/app/${projectId}/agent-reports/${report.id}`}
              className="flex flex-wrap justify-between gap-2 text-ui-body text-accent-text"
            >
              <span>
                {report.title}
                <span className="mt-1 block">
                  <PaymentChargeLine original payment={report.originalPayment} />
                </span>
              </span>
              <span className="font-mono text-ui-xs text-fg-muted">
                {report.createdAt.slice(0, 10)}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-ui-body text-fg-muted">{t("historyEmpty")}</p>
      )}
    </Card>
  );
}
