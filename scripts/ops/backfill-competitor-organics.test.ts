import { expect, it } from "vitest";
import { parseBackfillOptions } from "./backfill-competitor-organics";
import { projectPublicId } from "@/lib/evidence-replay/test-fixture";
const window = ["--project",projectPublicId,"--from","2026-10-01T00:00:00Z","--to","2026-10-12T00:00:00Z"];
it("requires explicit project/history window and defaults to no-write dry-run", () => {
  expect(() => parseBackfillOptions(["--batch-size","50"])).toThrow();
  expect(parseBackfillOptions(window)).toMatchObject({projectId:projectPublicId,execute:false,batchSize:200,maxBatches:1});
});
it.each([ ["--execute","--dry-run"], ["--batch-size","201"], ["--batch-size","0"], ["--max-batches","101"], ["--actor","owner"] ])("refuses unsafe CLI options", args => expect(() => parseBackfillOptions([...window,...args])).toThrow());
it("resumes only explicit executed original runs without replacing their frozen window", () => {
  expect(parseBackfillOptions(["--project",projectPublicId,"--execute","--resume","original-run"])).toMatchObject({execute:true,resume:"original-run",request:null});
  expect(() => parseBackfillOptions([...window,"--execute","--resume","original-run"])).toThrow();
  expect(() => parseBackfillOptions(["--project",projectPublicId,"--resume","original-run"])).toThrow();
});
