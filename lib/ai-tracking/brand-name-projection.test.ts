import { expect, it } from "vitest";
import { projectBrandNameCounts } from "./brand-name-projection";

it("counts answers and the names that survive exclusions", () => {
  const counts = projectBrandNameCounts(
    ["acme.example.org is a different site.", "Acme Tools appears once. Acme appears too.", ""],
    {
      aliases: ["Acme Tools"],
      domain: "acme.example.com",
      excludedNames: ["acme.example.org"],
      label: "Acme",
    },
  );
  expect(counts.answers).toBe(3);
  expect(counts.named).toBe(1);
  expect(counts.names).toEqual([
    { count: 1, name: "Acme" },
    { count: 1, name: "Acme Tools" },
  ]);
});
