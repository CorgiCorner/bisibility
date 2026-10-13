import { expect, test } from "vitest";
import { projectTransportFence } from "./transport-fence";

test("legacy possible-send presence keeps both plausible and shifted time unknown", () => {
  for (const transportFenceEpochMs of ["1790856000000.000000", "1790863200000.000000"])
    expect(
      projectTransportFence({ transportFenced: true, fenced_at_iso: null, transportFenceEpochMs }),
    ).toEqual({
      transportFenced: true,
      transportFenceProvenance: "legacy_unknown",
      transportFenceInstant: null,
    });
  expect(
    projectTransportFence({
      transportFenced: false,
      fenced_at_iso: null,
      transportFenceEpochMs: null,
    }),
  ).toEqual({
    transportFenced: false,
    transportFenceProvenance: "none",
    transportFenceInstant: null,
  });
});
test.each(["2026-10-01T12:00:00", "2026-02-31T12:00:00.000Z", "not-a-date"])(
  "invalid original evidence is refused: %s",
  (fenced_at_iso) => {
    expect(() =>
      projectTransportFence({
        transportFenced: true,
        fenced_at_iso,
        transportFenceEpochMs: "1790856000000",
      }),
    ).toThrow();
  },
);
test("unfenced evidence cannot acquire possible-send presence", () => {
  expect(() =>
    projectTransportFence({
      transportFenced: false,
      fenced_at_iso: "2026-10-01T12:00:00.000Z",
      transportFenceEpochMs: null,
    }),
  ).toThrow();
});
test("valid new ISO is verified against actual physical epoch on every projection", () => {
  const row = {
    transportFenced: true,
    fenced_at_iso: "2026-10-01T12:00:00.000Z",
    transportFenceEpochMs: "1790856000000.000000",
  };
  expect(projectTransportFence(row)).toMatchObject({ transportFenceProvenance: "utc_iso_v1" });
  expect(() =>
    projectTransportFence({ ...row, transportFenceEpochMs: "1790863200000.000000" }),
  ).toThrow("physical instant");
  expect(() =>
    projectTransportFence({ ...row, transportFenceEpochMs: "1790856000000.001" }),
  ).toThrow("physical instant");
});
