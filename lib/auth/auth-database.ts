import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

const authTransactionStorage = new AsyncLocalStorage<Prisma.TransactionClient>();

export function currentAuthTransaction() {
  return authTransactionStorage.getStore() ?? null;
}

function bindPrismaValue(target: typeof prisma, property: keyof typeof prisma) {
  const value = Reflect.get(target, property, target);
  return typeof value === "function" ? value.bind(target) : value;
}

export const authDatabase = new Proxy(prisma, {
  get(target, property: keyof typeof prisma) {
    if (property !== "$transaction") {
      return bindPrismaValue(target, property);
    }

    return async (callback: (transaction: unknown) => Promise<unknown>) => {
      return target.$transaction((transaction) =>
        authTransactionStorage.run(transaction, () => callback(transaction)),
      );
    };
  },
}) as typeof prisma;
