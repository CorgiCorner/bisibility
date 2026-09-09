import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { inspectRepository, inspectServerTooltipSource } from "./server-tooltip-boundary.mjs";

function violations(source) {
  return inspectServerTooltipSource(source, "Fixture.tsx");
}

describe("server Tooltip boundary guard", () => {
  it("rejects Tooltip leaf imports, including aliases, in a Server Component", () => {
    const result = violations(`
      import { Tooltip as HelpBubble } from "@/components/ui/Tooltip";
      export function Fixture() {
        return <HelpBubble content="Help"><button>Open</button></HelpBubble>;
      }
    `);
    assert.equal(result.length, 1);
  });

  it("rejects direct Tooltip JSX in a Server Component", () => {
    const result = violations(`
      import { Tooltip } from "@/components/ui";
      export function Fixture() {
        return <Tooltip content="Help"><button>Open</button></Tooltip>;
      }
    `);

    assert.equal(result.length, 1);
    assert.match(result[0].message, /create a client boundary that owns both Tooltip and trigger/u);
  });

  it("allows direct Tooltip JSX in a Client Component", () => {
    const result = violations(`
      "use client";
      import { Tooltip } from "@/components/ui";
      export function Fixture() {
        return <Tooltip content="Help"><button>Open</button></Tooltip>;
      }
    `);

    assert.deepEqual(result, []);
  });

  it("does not treat a late use client string as a directive", () => {
    const result = violations(`
      import { Tooltip } from "@/components/ui";
      "use client";
      export function Fixture() {
        return <Tooltip content="Help"><button>Open</button></Tooltip>;
      }
    `);

    assert.equal(result.length, 1);
  });

  it("allows InfoTooltip in a Server Component", () => {
    const result = violations(`
      import { InfoTooltip } from "@/components/ui";
      export function Fixture() {
        return <InfoTooltip content="Help" />;
      }
    `);

    assert.deepEqual(result, []);
  });

  it("rejects aliased Tooltip JSX in a Server Component", () => {
    const result = violations(`
      import { Tooltip as HelpBubble } from "@/components/ui";
      export function Fixture() {
        return <HelpBubble content="Help"><button>Open</button></HelpBubble>;
      }
    `);

    assert.equal(result.length, 1);
  });

  it("ratchets the repository-wide violation total without encoding source filenames", () => {
    const root = mkdtempSync(path.join(tmpdir(), "server-tooltip-boundary-"));
    try {
      const componentsRoot = path.join(root, "components");
      mkdirSync(componentsRoot, { recursive: true });

      for (let index = 0; index < 16; index += 1) {
        writeFileSync(
          path.join(componentsRoot, `Fixture${index}.tsx`),
          `import { Tooltip } from "@/components/ui";
           export const Fixture${index} = () => <Tooltip content="Help"><span>Open</span></Tooltip>;`,
        );
      }

      assert.deepEqual(inspectRepository(root), []);

      writeFileSync(
        path.join(componentsRoot, "Regression.tsx"),
        `import { Tooltip } from "@/components/ui";
         export const Regression = () => <Tooltip content="Help"><span>Open</span></Tooltip>;`,
      );

      const result = inspectRepository(root);
      assert.equal(result.length, 17);
      assert.ok(result.some((violation) => violation.fileName === "components/Regression.tsx"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("allows type-only Tooltip mentions", () => {
    const result = violations(`
      import type { Tooltip as TooltipType } from "@/components/ui";
      type Props = { tooltip: TooltipType };
      export function Fixture({ tooltip }: Props) {
        return <div>{String(tooltip)}</div>;
      }
    `);

    assert.deepEqual(result, []);
  });
});
