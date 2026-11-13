import { redirect } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it } from "vitest";
import TimelineRedirect from "./page";

describe("TimelineRedirect", () => {
  beforeEach(() => {
    redirect.mockReset();
  });

  it("sends the old route to annotations and keeps the query", async () => {
    await TimelineRedirect({
      params: Promise.resolve({ project: "prj_abcdefghijklmnopqrstuvwx" }),
      searchParams: Promise.resolve({ filter: "deploys", q: "sig_note" }),
    });

    expect(redirect).toHaveBeenCalledWith(
      "/app/prj_abcdefghijklmnopqrstuvwx/annotations?filter=deploys&q=sig_note",
    );
  });
});
