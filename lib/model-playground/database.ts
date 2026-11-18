import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ModelPlaygroundDatabase, ModelPlaygroundTransaction } from "./store-db";

/** Prisma's raw generic is the complete array; the store port types one row. */
export const modelPlaygroundDatabase: ModelPlaygroundDatabase = {
  $transaction: (work) =>
    prisma.$transaction((tx) => work(tx as unknown as ModelPlaygroundTransaction)),
};
