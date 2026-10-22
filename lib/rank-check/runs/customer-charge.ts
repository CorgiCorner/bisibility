import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { SerpDepth } from "@/lib/serp/constants";
import { sumQuotedCents } from "./quoted-cents";

type ReservationInput = {
  connection: {
    credentialSource?: string | null;
    id?: string;
    provider: string;
  };
  projectId: string;
  source: string;
  targets: readonly { keywordId: string; cost: number | null; depth: SerpDepth }[];
};

/**
 * Customer charge for a hosted rank reservation. Undefined for your keys, or when a target
 * has no positive provider cost the reservation quote can price.
 */
export async function hostedReservationCustomerCents(
  input: ReservationInput,
  db?: Prisma.TransactionClient,
): Promise<number | undefined> {
  if (input.connection.credentialSource !== "hosted" || !input.connection.id) return undefined;
  if (
    input.targets.length === 0 ||
    input.targets.some((target) => target.cost == null || target.cost <= 0)
  )
    return undefined;
  const { quoteRankRunReservation } = await import("./launch-preflight");
  const quote = db
    ? await quoteRankRunReservation(db, input as Parameters<typeof quoteRankRunReservation>[1])
    : await prisma.$transaction((tx) =>
        quoteRankRunReservation(tx, input as Parameters<typeof quoteRankRunReservation>[1]),
      );
  return sumQuotedCents("rankReservationPrices" in quote ? quote.rankReservationPrices : undefined);
}
