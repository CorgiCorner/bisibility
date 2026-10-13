import type { Prisma } from "@/lib/generated/prisma/client";

/** Fault barriers cover both host SQL and the shared adapter's bound statements. */
export function interceptExecute(
  transaction: Prisma.TransactionClient,
  intercept: (text: string, execute: () => Promise<number>) => Promise<number>,
): Prisma.TransactionClient {
  return new Proxy(transaction, {
    get(target, key) {
      if (key !== "$executeRaw" && key !== "$executeRawUnsafe") return Reflect.get(target, key);
      return (...args: unknown[]) => {
        const query = args[0] as string | Prisma.Sql | TemplateStringsArray;
        const text =
          typeof query === "string"
            ? query
            : "strings" in query
              ? query.strings.join("")
              : Array.from(query).join("");
        return intercept(text, () => Reflect.apply(Reflect.get(target, key), target, args));
      };
    },
  });
}
