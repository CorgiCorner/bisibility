import { expect, test } from "vitest";
import { launchModelPlayground } from "./launch";
import { launchHarness, launchRequest as request } from "./launch.test-support";
import { previewModelPlayground } from "./preview";
import { readModelPlayground } from "./read";
import * as stores from "./store";

const h = launchHarness();
const preview = () => previewModelPlayground(h.runtime, { revision: "revision", input: h.input });
test("late accounting cannot replace the first paid answer when the result write failed", async () => {
  const quote = await preview();
  const req = request(quote);
  await h.sql.exec(`CREATE FUNCTION reject_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture result failure'; END $$;
    CREATE TRIGGER fail_result BEFORE UPDATE ON model_playground_columns FOR EACH ROW WHEN (NEW.result IS NOT NULL) EXECUTE FUNCTION reject_result();`);
  const launched = await launchModelPlayground(h.runtime, req);
  expect(launched.kind).toBe("admitted");
  if (launched.kind !== "admitted") return;
  const { recordModelDispatchEvidence } = await import("@/lib/provider-usage/model-accounting");
  await recordModelDispatchEvidence(
    h.runtime.db,
    h.calls[0],
    {
      ...launched.result.columns[0],
      answer: "Conflicting late evidence that must never replace the original paid answer.",
    },
    new Date(+h.now + 1000),
  );
  const retained = await readModelPlayground(h.runtime, launched.result.runId);
  expect(retained?.columns[0].answer).toBe("An answer with two citations.");
  expect(h.calls).toHaveLength(1);
});

test("a denied follow-up read cannot discard the initiating client's paid answer", async () => {
  const q = await preview();
  h.answer((answer) => {
    h.block();
    return answer;
  });
  const out = await launchModelPlayground(h.runtime, request(q));
  expect(out.kind).toBe("admitted");
  if (out.kind !== "admitted") throw new Error("Expected paid answer");
  expect(out.result.columns[0].answer).toBe("An answer with two citations.");
  expect(
    (
      await stores
        .createModelPlaygroundStore(h.runtime.db)
        .read(h.context.projectId, out.result.runId)
    ).columns[0].result?.answer,
  ).toBe("An answer with two citations.");
  expect(await readModelPlayground(h.runtime, out.result.runId)).toBeNull();
  expect(h.calls).toHaveLength(1);
});

test("unavailable selected connection at launch is typed no-send", async () => {
  const q = await preview();
  await h.sql.exec(`UPDATE provider_connections SET enabled=false`);
  expect((await launchModelPlayground(h.runtime, request(q))).kind).toBe("not_dispatched");
  expect(h.calls).toHaveLength(0);
});
