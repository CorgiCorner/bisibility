import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindConfig from "@/tailwind.config";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const theme = (tailwindConfig as { theme: { extend: Record<string, unknown> } }).theme.extend;

const fontSize = theme.fontSize as Record<
  string,
  [string, { lineHeight: string; fontWeight?: string }]
>;
const borderRadius = theme.borderRadius as Record<string, string>;
const maxWidth = theme.maxWidth as Record<string, string>;

describe("type role tokens", () => {
  it("defines ui-h1 at 21px / 1.25 / 600", () => {
    expect(fontSize["ui-h1"]).toEqual(["21px", { lineHeight: "1.25", fontWeight: "600" }]);
  });

  it("defines ui-section at 15px / 1.35 / 600", () => {
    expect(fontSize["ui-section"]).toEqual(["15px", { lineHeight: "1.35", fontWeight: "600" }]);
  });

  it("defines ui-body at 13px / 1.5 without forced weight", () => {
    expect(fontSize["ui-body"]).toEqual(["13px", { lineHeight: "1.5" }]);
    expect(fontSize["ui-body"][1]).not.toHaveProperty("fontWeight");
  });

  it("defines ui-body-relaxed at 14px / 1.5 without forced weight", () => {
    expect(fontSize["ui-body-relaxed"]).toEqual(["14px", { lineHeight: "1.5" }]);
    expect(fontSize["ui-body-relaxed"][1]).not.toHaveProperty("fontWeight");
  });

  it("defines ui-caption at 12px / 1.45 without forced weight", () => {
    expect(fontSize["ui-caption"]).toEqual(["12px", { lineHeight: "1.45" }]);
    expect(fontSize["ui-caption"][1]).not.toHaveProperty("fontWeight");
  });

  it("defines ui-micro at 10px / 1.4 without forced weight", () => {
    expect(fontSize["ui-micro"]).toEqual(["10px", { lineHeight: "1.4" }]);
    expect(fontSize["ui-micro"][1]).not.toHaveProperty("fontWeight");
  });

  it("does not add deferred display roles", () => {
    const deferred = ["display-sm", "display-md", "display-lg", "display-xl"];
    for (const key of Object.keys(fontSize)) {
      expect(key).not.toMatch(/^display-/);
      expect(deferred).not.toContain(key);
    }
  });
});

describe("radius role tokens", () => {
  it("defines control at 9px", () => {
    expect(borderRadius.control).toBe("9px");
  });

  it("defines card at 14px", () => {
    expect(borderRadius.card).toBe("14px");
  });

  it("defines card-lg at 16px", () => {
    expect(borderRadius["card-lg"]).toBe("16px");
  });

  it("does not add a 20px or 7px global radius", () => {
    for (const value of Object.values(borderRadius)) {
      expect(value).not.toBe("20px");
      expect(value).not.toBe("7px");
    }
  });
});

describe("max-width role tokens", () => {
  it("defines content at 1200px", () => {
    expect(maxWidth.content).toBe("1200px");
  });

  it("defines settings at 780px", () => {
    expect(maxWidth.settings).toBe("780px");
  });

  it("does not add a shell-width or metric-grid global token", () => {
    expect(maxWidth).not.toHaveProperty("shell");
    expect(maxWidth).not.toHaveProperty("shell-collapsed");
    expect(maxWidth).not.toHaveProperty("metric-grid");
  });
});

describe("type-label composite utility", () => {
  const utilCssPath = resolve(process.cwd(), "app/styles/app-utilities.css");
  const utilCss = readFileSync(utilCssPath, "utf8");
  const ast = postcss.parse(utilCss);

  function typeLabelAtRule() {
    let found: postcss.AtRule | undefined;
    ast.walkAtRules("utility", (atrule) => {
      if (atrule.params === "type-label") found = atrule;
    });
    return found;
  }

  it("declares exactly the settled declarations", () => {
    const atRule = typeLabelAtRule();
    expect(atRule).toBeDefined();

    const decls = new Map<string, string>();
    atRule?.walkDecls((decl) => {
      decls.set(decl.prop, decl.value);
    });

    expect(decls.get("font-family")).toBe("var(--font-mono), monospace");
    expect(decls.get("font-size")).toBe("11px");
    expect(decls.get("font-weight")).toBe("600");
    expect(decls.get("line-height")).toBe("1.2");
    expect(decls.get("letter-spacing")).toBe("0.5px");
    expect(decls.get("text-transform")).toBe("uppercase");
    expect(decls.size).toBe(6);
  });

  it("does not encode a 10px or 10.5px monospace label size", () => {
    const atRule = typeLabelAtRule();
    const size = atRule?.nodes?.find(
      (n): n is postcss.Declaration => n.type === "decl" && n.prop === "font-size",
    )?.value;
    expect(size).not.toBe("10px");
    expect(size).not.toBe("10.5px");
  });
});

describe("DesignTokens story exercises every role and geometry token", () => {
  const storyPath = resolve(process.cwd(), "components/ui/DesignTokens.stories.tsx");
  const storySource = readFileSync(storyPath, "utf8");

  const typeRoles = [
    "text-ui-h1",
    "text-ui-section",
    "text-ui-body",
    "text-ui-body-relaxed",
    "text-ui-caption",
    "text-ui-micro",
  ];
  const radiusRoles = ["rounded-control", "rounded-card", "rounded-card-lg"];
  const maxWRoles = ["max-w-content", "max-w-settings"];
  const typeRoleBlock = storySource.match(/const typeRoles = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
  const radiusRoleBlock =
    storySource.match(/const radiusRoles = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
  const declaredRoles = (source: string) =>
    [...source.matchAll(/\brole: "([^"]+)"/g)].map((match) => match[1]);

  it.each(typeRoles)("renders the %s type role", (role) => {
    expect(declaredRoles(typeRoleBlock)).toContain(role);
  });

  it("renders the type-label composite role", () => {
    expect(storySource).toContain('<p className="type-label">Type Label</p>');
  });

  it.each(radiusRoles)("renders the %s radius role", (role) => {
    expect(declaredRoles(radiusRoleBlock)).toContain(role);
  });

  it("binds radius specimens directly to their declared role", () => {
    expect(storySource).toContain(
      `className={\`h-16 w-full border border-border bg-bg \${r.role}\`}`,
    );
  });

  it.each(maxWRoles)("renders the %s max-width role", (role) => {
    expect(storySource).toContain(`className="w-full ${role} border-b-2 border-accent pb-2"`);
  });

  it("binds generic type specimens directly to their declared role without a weight override", () => {
    expect(storySource).toContain("<p className={t.role}>{t.label}</p>");
  });

  it("documents the 80px collapsed shell as component-owned geometry", () => {
    expect(storySource).toMatch(/shell is 80px and remains component-owned geometry/);
  });

  it("documents minmax(150px,1fr) metric grid as local geometry", () => {
    expect(storySource).toMatch(/minmax\(150px,1fr\) as intentional local geometry/);
  });
});

describe("intentional local geometry (no global token)", () => {
  it("does not add a global width token for the 80px collapsed shell", () => {
    for (const [key, value] of Object.entries(maxWidth)) {
      expect(key).not.toMatch(/shell/);
      expect(value).not.toBe("80px");
      expect(value).not.toBe("72px");
    }
  });

  it("does not add a global grid-template token for the metric grid", () => {
    const gridTemplateColumns = (theme.gridTemplateColumns ?? {}) as Record<string, string>;
    for (const [key, value] of Object.entries(gridTemplateColumns)) {
      expect(key).not.toMatch(/metric/);
      expect(value).not.toBe("minmax(150px,1fr)");
    }
    const gridTemplate = (theme.gridTemplate ?? {}) as Record<string, string>;
    for (const [key, value] of Object.entries(gridTemplate)) {
      expect(key).not.toMatch(/metric/);
      expect(value).not.toBe("minmax(150px,1fr)");
    }
  });
});
