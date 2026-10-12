import { expect, test } from "vitest";
import { rankCheckLedgerActuals, rankCheckRunLedgerActuals } from "./rank-check-run-accounting";

test.each([rankCheckLedgerActuals, rankCheckRunLedgerActuals])(
  "reads a large monthly population within PostgreSQL's bind parameter limit",
  async (read) => {
    const ids = Array.from({ length: 30_000 }, (_, index) => `check-${index}`);
    const client = {
      async $queryRaw(query: { values: unknown[] }) {
        if (query.values.length > 65_535) throw new Error("Too many bind parameters");
        return [];
      },
    };
    await expect(read("project", ids, client as never)).resolves.toEqual(new Map());
  },
);
