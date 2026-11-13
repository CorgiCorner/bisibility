import { expect, it } from "vitest";
import { trackingRunSnapshot } from "./brand-name-snapshot";
import { trackingEntityObservations } from "./execution/observations";

it("carries own-brand aliases and every excluded list, and still accepts a snapshot without them", () => {
  expect(
    trackingRunSnapshot(
      {
        brandAliases: ["Acme Tools"],
        brandExcludedNames: ["acme.example.org"],
        domain: "acme.example.com",
        id: "project",
        name: "Acme",
        publicId: "prj_public",
      },
      [
        {
          aliases: ["Other"],
          domain: "other.example.com",
          excludedNames: ["other.example.org"],
          id: "competitor",
          label: "Other",
          publicId: "cmp_public",
        },
      ],
    ),
  ).toEqual([
    {
      aliases: ["Acme Tools"],
      domain: "acme.example.com",
      excludedNames: ["acme.example.org"],
      id: "project",
      kind: "project",
      label: "Acme",
      publicId: "prj_public",
    },
    {
      aliases: ["Other"],
      domain: "other.example.com",
      excludedNames: ["other.example.org"],
      id: "competitor",
      kind: "competitor",
      label: "Other",
      publicId: "cmp_public",
    },
  ]);

  const legacy = trackingRunSnapshot(
    { domain: "acme.example.com", id: "project", name: "Acme", publicId: "prj_public" },
    [
      {
        aliases: [],
        domain: "other.example.com",
        id: "competitor",
        label: null,
        publicId: "cmp_public",
      },
    ],
  );
  expect(legacy[0]).toMatchObject({ aliases: [], excludedNames: [] });
  expect(
    trackingEntityObservations("Other is here, and so is Acme.", [
      { aliases: [], id: "project", kind: "project", label: "Acme" },
      { id: "competitor", kind: "competitor", label: "Other" },
    ])[1],
  ).toMatchObject({ mentioned: true });
});
