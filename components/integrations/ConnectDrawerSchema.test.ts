import { STALE_DEPLOYMENT_MESSAGE } from "@/lib/ui/action-error";
import { describe, expect, it } from "vitest";
import { providerActionErrorNotice } from "./ConnectDrawerSchema";

describe("providerActionErrorNotice", () => {
  it("presents stale Server Actions as a recoverable app update", () => {
    expect(
      providerActionErrorNotice(
        new Error(
          'Server Action "4060ab4747e8669a2966edc772d11ed4d763a28cbc" was not found on the server.',
        ),
      ),
    ).toEqual({
      action: "refresh",
      message: STALE_DEPLOYMENT_MESSAGE,
      ok: false,
      title: "App update required",
      tone: "warning",
    });
  });

  it("keeps provider failures separate from deployment skew", () => {
    expect(providerActionErrorNotice(new Error("Credentials were rejected."))).toEqual({
      message: "Credentials were rejected.",
      ok: false,
      title: "Provider action failed",
    });
  });
});
