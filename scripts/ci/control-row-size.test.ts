import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import ts from "@typescript/typescript6";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const rowControls = new Set([
  "Button",
  "Input",
  "MenuSelect",
  "ResearchHistoryButton",
  "SegmentedControl",
  "Textarea",
]);

function posixPath(filename: string) {
  return relative(root, filename).split(sep).join("/");
}

function isRowClass(value: string) {
  return value.includes("flex") && value.includes("gap-") && (!value.includes("flex-col") || /(?:^|\s)(?:sm|md|lg):flex-row(?:\s|$)/.test(value));
}

function classText(attribute: ts.JsxAttribute | undefined) {
  const initializer = attribute?.initializer;
  if (!initializer || !ts.isStringLiteral(initializer)) return "";
  return initializer.text;
}

function sizeValues(attribute: ts.JsxAttribute | undefined): string[] {
  function literals(node: ts.Node | undefined): string[] {
    if (!node) return [];
    if (ts.isStringLiteral(node)) return [node.text];
    if (ts.isJsxExpression(node) || ts.isParenthesizedExpression(node)) return literals(node.expression);
    if (ts.isConditionalExpression(node)) return [...literals(node.whenTrue), ...literals(node.whenFalse)];
    // Wrapper prop passthroughs do not choose a size.
    return [];
  }
  return literals(attribute?.initializer);
}

function tagName(node: ts.JsxOpeningLikeElement) {
  const name = node.tagName;
  return ts.isIdentifier(name) ? name.text : null;
}

function attribute(node: ts.JsxOpeningLikeElement, name: string) {
  return node.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name,
  );
}

function collect(node: ts.Node, sizes: { input: boolean; smallButton: boolean; extraSmallButton: boolean }) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    const name = tagName(node);
    const values = sizeValues(attribute(node, "size"));
    if ((name === "Input" || name === "Textarea") && !sizeValues(attribute(node, "density")).includes("compact")) sizes.input = true;
    for (const size of values) {
      if (name && rowControls.has(name) && size === "input") sizes.input = true;
      if (name === "Button" && size === "xs") sizes.extraSmallButton = true;
      if ((name === "Button" || name === "ResearchHistoryButton") && size === "sm") sizes.smallButton = true;
    }
  }
  ts.forEachChild(node, (child) => collect(child, sizes));
}

function sourceFiles(directory: string): string[] {
  const absolute = resolve(root, directory);
  if (!existsSync(absolute)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const path = join(absolute, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(relative(root, path)));
    else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.") && !entry.name.includes(".stories.")) {
      files.push(path);
    }
  }
  return files;
}

function rowMismatches(sourceFile: ts.SourceFile, file: string) {
  const mismatches: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && isRowClass(classText(attribute(node.openingElement, "className")))) {
      const sizes = { input: false, smallButton: false, extraSmallButton: false };
      collect(node, sizes);
      if (sizes.smallButton && (sizes.input || sizes.extraSmallButton)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        mismatches.push(`${file}:${line}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return mismatches;
}

const boxControls = new Map([
  ["input", "input"], ["Input", "input"], ["Textarea", "input"], ["MenuSelect", "toolbar"], ["MenuMultiSelect", "toolbar"], ["CountrySelect", "toolbar"],
  ["SegmentedControl", "default"], ["Button", "md"],
  ["ResearchScopePicker", "input"], ["ActionPaymentOptionPicker", "toolbar"], ["PasswordInput", "input"], ["AchievementActionsMenu", "xs"],
]);
const equivalentSizes: Record<string, string> = { field: "input", sm: "toolbar" };
const boxTags = new Set(["form", "Sheet", "AppDrawer", "Dialog", "DialogContent", "Modal", "Card"]);

function isToolbarBox(node: ts.Node) {
  if (ts.isJsxAttribute(node)) return ts.isIdentifier(node.name) && ["header", "headerAction", "toolbar"].includes(node.name.text);
  if (!ts.isJsxElement(node)) return false;
  return ["header", "CardHeader"].includes(tagName(node.openingElement) ?? "") || classText(attribute(node.openingElement, "role")) === "toolbar";
}

function collectBoxSizes(node: ts.Node, sizes: Set<string>, visited = new Set<ts.Node>(), skipFooters = true, boundary = node) {
  if (visited.has(node)) return;
  visited.add(node);
  // Nested surfaces and explicit header/toolbars own their controls independently.
  if (node !== boundary && (isToolbarBox(node) || (ts.isJsxElement(node) && boxTags.has(tagName(node.openingElement) ?? "") && tagName(node.openingElement) !== "form"))) return;
  // Sheet footer actions are outside the form box. Inline form actions are checked.
  if (skipFooters && ts.isJsxAttribute(node) && node.name.getText() === "footer") return;
  if (skipFooters && ts.isJsxElement(node) && tagName(node.openingElement) === "footer") return;
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    const name = tagName(node);
    const fallback = name === "input" && !attribute(node, "data-input-inner") ? undefined : name ? boxControls.get(name) : undefined;
    if (name && !fallback && /^[A-Z]/.test(name)) {
      const local = node.getSourceFile().statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
      if (local) collectBoxSizes(local, sizes, visited, skipFooters);
    }
    if (fallback !== undefined) {
      const sizeAttr = attribute(node, "size");
      const values = (name === "Input" || name === "Textarea") && sizeValues(attribute(node, "density")).includes("compact") ? ["toolbar"] : sizeAttr ? sizeValues(sizeAttr) : [fallback];
      for (const size of values) sizes.add(equivalentSizes[size] ?? size);
    }
  }
  ts.forEachChild(node, (child) => collectBoxSizes(child, sizes, visited, skipFooters, boundary));
}

function boxMismatches(sourceFile: ts.SourceFile, file: string) {
  const mismatches: string[] = [];
  function check(node: ts.Node) {
    const sizes = new Set<string>();
    collectBoxSizes(node, sizes);
    if (sizes.size > 1) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      mismatches.push(`${file}:${line} (${[...sizes].sort().join(", ")})`);
    }
  }
  function visit(node: ts.Node) {
    if ((ts.isJsxElement(node) && boxTags.has(tagName(node.openingElement) ?? "")) || isToolbarBox(node)) check(node);
    ts.forEachChild(node, visit);
  }
  // Split drawer bodies have no Sheet of their own, but still own one form box.
  if (/(?:Fields|Picker|Controls|(?:Drawer|Dialog)Body)\.tsx$/.test(file)) check(sourceFile);
  visit(sourceFile);
  return mismatches;
}

function parse(source: string) {
  return ts.createSourceFile("fixture.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function footerMismatches(sourceFile: ts.SourceFile, file: string) {
  const mismatches: string[] = [];
  function visit(node: ts.Node) {
    if ((ts.isJsxAttribute(node) && node.name.getText() === "footer") ||
        (ts.isJsxElement(node) && tagName(node.openingElement) === "footer")) {
      const sizes = new Set<string>();
      collectBoxSizes(node, sizes, new Set(), false);
      if (sizes.size > 1) mismatches.push(`${file}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1} (${[...sizes].sort().join(", ")})`);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return mismatches;
}

let scanned: { box: string[]; row: string[]; footer: string[] } | undefined;
function scanRepository() {
  if (scanned) return scanned;
  scanned = { box: [], row: [], footer: [] };
  for (const filename of ["components", "app"].flatMap(sourceFiles)) {
    const file = posixPath(filename);
    const sourceFile = parse(readFileSync(filename, "utf8"));
    scanned.box.push(...boxMismatches(sourceFile, file));
    scanned.row.push(...rowMismatches(sourceFile, file));
    scanned.footer.push(...footerMismatches(sourceFile, file));
  }
  return scanned;
}

describe("control row size", () => {
  it("keeps one size across all rows of form boxes throughout components and app and split drawer bodies", () => {
    expect(scanRepository().box).toEqual([]);
  });

  it.each([
    '<form><div><Input /></div><div><MenuSelect /></div></form>',
    '<form><Input /><Button size="sm" /></form>',
    '<form><MenuSelect size="input" /><SegmentedControl size="toolbar" /></form>',
    '<form><Input /><Button /></form>',
    '<form><Textarea /><Button size="xs" /></form>',
    '<AppDrawer><div><MenuSelect size="input" /></div><div><Button /></div></AppDrawer>',
  ])("rejects mixed control sizes anywhere in a form: %s", (source) => {
    expect(boxMismatches(parse(source), "fixture.tsx")).toHaveLength(1);
  });

  it.each([
    ["components/business-locations/IdentityFields.tsx", "input"],
    ["components/report-sharing/ReportSharePanels.tsx", "input"],
    ["components/alerts/NewRuleMarketFields.tsx", "input"],
    ["components/local-monitors/MonitorKeywordPicker.tsx", "input"],
    ["components/account/AccountEmailConfirmation.tsx", "input"],
    ["components/settings/usage/ProviderLimitRows.tsx", "toolbar"],
    ["components/ai-research/AiEngineFields.tsx", "input"],
    ["components/ai-research/AiPromptFields.tsx", "input"],
    ["components/ai-tracking/TrackingModelControl.tsx", "input"],
    ["components/ai-tracking/TrackingSavedConfiguration.tsx", "input"],
    ["components/search-insights/page-indexing/IndexingInspectSource.tsx", "input"],
    ["components/research/ResearchScopePicker.tsx", "input"],
  ])("keeps imported controls at their host size: %s (%s)", (file, expectedSize) => {
    const sizes = new Set<string>();
    collectBoxSizes(parse(readFileSync(resolve(root, file), "utf8")), sizes);
    expect([...sizes], `${file}:1 (${[...sizes].sort().join(", ")})`).toEqual([expectedSize]);
  });

  it.each([
    '<Modal><MenuSelect size="input" /><Button size="sm" /></Modal>',
    '<Card><Input /><Button size="sm" /></Card>',
    '<Card><ResearchScopePicker /><Button size="sm" /></Card>',
    '<form><Input /><ActionPaymentOptionPicker /></form>',
    '<form><PasswordInput /><Button size="sm" /></form>',
    '<form><Input /><Button size={valid ? "input" : "sm"} /></form>',
  ])("rejects newly mapped boxes, wrappers and conditional sizes: %s", (source) => {
    expect(boxMismatches(parse(source), "fixture.tsx")).toEqual(["fixture.tsx:1 (input, toolbar)"]);
  });

  it.each(["IdentityFields.tsx", "MarketPicker.tsx", "FormControls.tsx"])("checks imported fields by name: %s", (file) => {
    expect(boxMismatches(parse('<div><Input /><MenuSelect /></div>'), file)).toEqual([`${file}:1 (input, toolbar)`]);
  });

  it("checks header toolbars and nested surfaces as independent boxes", () => {
    expect(boxMismatches(parse('<Card><header><Button size="sm" /></header><Input /><Button size="input" /><Modal><Button /></Modal></Card>'), "fixture.tsx")).toEqual([]);
    expect(boxMismatches(parse('<Card toolbar={<><MenuSelect /><Button size="sm" /></>}><Input /><Button size="input" /></Card>'), "fixture.tsx")).toEqual([]);
    expect(boxMismatches(parse('<Card><div role="toolbar"><MenuSelect /><Button /></div><Input /></Card>'), "fixture.tsx")).toEqual(["fixture.tsx:1 (md, toolbar)"]);
    expect(boxMismatches(parse('<form><Input /><Button size={size} /></form>'), "fixture.tsx")).toEqual([]);
  });

  it.each(["Input", "Textarea"])("counts %s in responsive rows unless compact", (control) => {
    expect(rowMismatches(parse(`<div className="flex flex-col md:flex-row gap-2"><${control} /><Button size="sm" /></div>`), "fixture.tsx")).toEqual(["fixture.tsx:1"]);
    expect(rowMismatches(parse(`<div className="flex gap-2"><${control} density="compact" /><Button size="sm" /></div>`), "fixture.tsx")).toEqual([]);
  });

  it("checks a card options menu against its host controls", () => {
    expect(boxMismatches(parse('<Card><MenuSelect /><AchievementActionsMenu /></Card>'), "fixture.tsx")).toEqual(["fixture.tsx:1 (toolbar, xs)"]);
    expect(boxMismatches(parse('<Card><MenuSelect /><AchievementActionsMenu size="sm" /></Card>'), "fixture.tsx")).toEqual([]);
  });

  it("prints the conflicting footer sizes", () => {
    expect(footerMismatches(parse('<Modal footer={<><Button size="sm" /><Button /></>} />'), "fixture.tsx")).toEqual(["fixture.tsx:1 (md, toolbar)"]);
  });

  it("checks split drawer bodies and excludes separate footer actions", () => {
    expect(boxMismatches(parse('<div><Input /><MenuSelect /></div>'), "CostDrawerFields.tsx")).toHaveLength(1);
    expect(boxMismatches(parse('function Fields() { return <MenuSelect />; } function Drawer() { return <form><Input /><Fields /></form>; }'), "fixture.tsx")).toHaveLength(1);
    expect(boxMismatches(parse('<Sheet footer={<Button size="sm" />}><form><Input /><MenuSelect size="input" /><SegmentedControl size="field" /><Button size="input" /></form></Sheet>'), "fixture.tsx")).toEqual([]);
    expect(boxMismatches(parse('<AppDrawer footer={<><Button /><Button /></>}><form><Input /><Button size="input" /></form></AppDrawer>'), "fixture.tsx")).toEqual([]);
  });
  it("does not put a small button in the same row as an input-sized control", () => {
    expect(scanRepository().row).toEqual([]);
  });

  it("keeps each sticky footer at one size independently of the body", () => {
    expect(scanRepository().footer).toEqual([]);
    expect(footerMismatches(parse('<Sheet footer={<><Button size="sm" /><Button /></>}><Input /></Sheet>'), "fixture.tsx")).toHaveLength(1);
    expect(footerMismatches(parse('<form><Input /><footer><Button size="sm" /><Button /></footer></form>'), "fixture.tsx")).toHaveLength(1);
  });

  it("checks compound text fields without treating hidden or bespoke native inputs as form controls", () => {
    expect(boxMismatches(parse('<form><input data-input-inner /><Button size="sm" /></form>'), "fixture.tsx")).toHaveLength(1);
    expect(boxMismatches(parse('<form><Input density="compact" /><Button size="sm" /></form>'), "fixture.tsx")).toEqual([]);
    expect(boxMismatches(parse('<form><input type="hidden" /><input className="custom-marketing-field" /><Button size="lg" /></form>'), "fixture.tsx")).toEqual([]);
    expect(boxMismatches(parse('<form><MenuMultiSelect size="input" /><Button size="sm" /></form>'), "fixture.tsx")).toHaveLength(1);
  });

  it("catches small and extra-small buttons beside each other", () => {
    const source = ts.createSourceFile("row.tsx", '<div className="flex gap-2"><Button size="sm" /><Button size="xs" /></div>', ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    expect(rowMismatches(source, "row.tsx")).toEqual(["row.tsx:1"]);
  });

  it("gives research history the form control size in the query tools", () => {
    for (const file of [
      "components/keywords/serp-playground/SerpPlaygroundHistory.tsx",
      "components/research/KeywordResearchHistory.tsx",
    ]) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source).toContain('size="input"');
      expect(source).not.toContain('size="sm"');
    }
  });
});
