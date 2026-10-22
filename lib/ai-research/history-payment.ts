import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import "server-only";
import { actionPaymentReceiptSchema } from "@/lib/action-payment/schema";
import { prisma } from "@/lib/db/prisma";
export async function aiHistoryPayments(projectId: string, ids: string[]) {
  if (!ids.length) return new Map<string, ActionPaymentReceipt>();
  const rows = await prisma.agentReport.findMany({
    where: { projectId, publicId: { in: ids } },
    select: { publicId: true, body: true },
  });
  return new Map(
    rows.flatMap((row) => {
      const parsed = actionPaymentReceiptSchema.safeParse(
        (row.body as Record<string, unknown>).originalPayment,
      );
      return parsed.success ? [[row.publicId, parsed.data] as const] : [];
    }),
  );
}
