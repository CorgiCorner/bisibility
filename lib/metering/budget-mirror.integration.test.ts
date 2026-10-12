import { expect, it } from "vitest";
import { guardConnectionFundingMutation } from "./budget-mirror";
import { reservePaidAttempts } from "./paid-admission";
import { input, paidFixture } from "./paid-attempt-test-fixture";
import { releasePaidAttempt } from "./settlement";

it("blocks custody changes until shared reservations resolve", async () => {
  const f = await paidFixture();
  try {
    await f.run((tx) => tx.$executeRaw`CREATE TABLE provider_connections(id text primary key)`);
    await f.run((tx) => tx.$executeRaw`INSERT INTO provider_connections VALUES('connection')`);
    const [reserved] = await f.run((tx) => reservePaidAttempts(tx, [input()], f.options));
    await expect(f.run((tx) => guardConnectionFundingMutation(tx, "connection"))).rejects.toThrow(
      "unresolved paid operations",
    );
    await f.run((tx) =>
      releasePaidAttempt(
        tx,
        {
          namespace: reserved.operation.scope.namespace,
          principal: reserved.operation.scope.principal,
          operationId: reserved.operation.operationId,
          expectedVersion: reserved.operation.version,
          commandId: "no-send",
          reason: "transport_not_started",
        },
        f.options,
      ),
    );
    await expect(
      f.run((tx) => guardConnectionFundingMutation(tx, "connection")),
    ).resolves.toBeUndefined();
  } finally {
    await f.close();
  }
});
