import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { sourceKeys } from "./model-playground-source-keys.test-support";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture(text: string, nested = false) {
  const root = mkdtempSync(join(tmpdir(), "locale-source-"));
  roots.push(root);
  const directory = nested ? join(root, "nested") : root;
  mkdirSync(directory, { recursive: true });
  const imports = [
    !/from\s+["']next-intl["']/.test(text)
      ? 'import { createTranslator, useTranslations } from "next-intl";'
      : "",
    text.includes("getTranslations") && !text.includes("next-intl/server")
      ? 'import { getTranslations } from "next-intl/server";'
      : "",
  ].filter(Boolean);
  writeFileSync(join(directory, "Component.tsx"), `${imports.join("\n")}\n${text}`);
  return root;
}
const declaration = 'const t = useTranslations("projectAiResearch");';

it.each([
  ['t("plain")', "plain"],
  ['t.rich("rich")', "rich"],
  ['t.markup("markup")', "markup"],
  ['t.raw("raw")', "raw"],
  ["t(`template`)", "template"],
])("discovers %s beside a positive control", (call, key) => {
  const root = fixture(`${declaration} t("control"); ${call};`);
  expect(sourceKeys([root], [])).toEqual(
    [...new Set(["control", key])].map((value) => `projectAiResearch.${value}`).sort(),
  );
});
it("discovers global namespaces, nested sources and lexical translator scopes", () => {
  const root = fixture(
    `
    function A() { ${declaration} t("first"); }
    function B() { const t = useTranslations("projectIntegrations"); t("second"); }
    function C() { const t = useTranslations(); t("shared.global"); }
  `,
    true,
  );
  expect(sourceKeys([root], [], ["projectAiResearch", "projectIntegrations", "shared"])).toEqual([
    "projectAiResearch.first",
    "projectIntegrations.second",
    "shared.global",
  ]);
});
// biome-ignore lint/suspicious/noTemplateCurlyInString: This is TSX source for the dynamic-key regression.
it.each(["t(key)", "t.rich(key)", "t(`prefix.${key}`)", 't(ok ? "known" : key)'])(
  "refuses an unreviewed dynamic key in %s",
  (call) => {
    const root = fixture(`${declaration} t("control"); ${call};`);
    expect(() => sourceKeys([root], [])).toThrow(/Unreviewed translation key/);
  },
);
it("expands conditional literal keys and only permits pinned result-copy unions", () => {
  const root = fixture(`${declaration}
    t(ok ? ("one") : (ok ? "two" : "one"));
    const key: "modelPlayground.unknown" | "modelPlayground.unreported" = value;
    t(key);
  `);
  const pinned = [
    "projectAiResearch.modelPlayground.unknown",
    "projectAiResearch.modelPlayground.unreported",
  ];
  expect(sourceKeys([root], pinned)).toEqual([
    ...pinned,
    "projectAiResearch.one",
    "projectAiResearch.two",
  ]);
  expect(() => sourceKeys([root], pinned.slice(1))).toThrow(/Unreviewed translation key/);
});

it.each([
  'const t = useTranslations(namespace); t("missing");',
  'function Row({ t }: { t: ReturnType<typeof useTranslations<string>> }) { t("missing"); }',
  'function Row(props: { t: ReturnType<typeof useTranslations<string>> }) { props.t("missing"); }',
  'function Row(props: { t: ReturnType<typeof useTranslations<string>> }) { props.t.rich("missing"); }',
  'const t = useTranslations(namespace); const alias = t; alias("missing");',
  'const copies = { row: useTranslations(namespace) }; copies.row("missing");',
  "const forwarded = useCallback((key: string) => t(key), [t]);",
  "t(makeKey());",
])("refuses unproven translator provenance: %s", (call) => {
  const root = fixture(`${declaration} t("control"); { ${call} }`);
  expect(() => sourceKeys([root], [])).toThrow(/Unreviewed translation (key|namespace|binding)/);
});

it.each([
  'const t = getTranslations("projectAiResearch");',
  'const t = await getTranslations({ locale: "pl", namespace: "projectAiResearch" });',
  'const t = await getTranslations({ locale, "namespace": "projectAiResearch" });',
  'const original = useTranslations("projectAiResearch"); const t = original;',
  'import { useTranslations as useCopy } from "next-intl"; const t = useCopy("projectAiResearch");',
])("discovers a proven translator: %s", (setup) => {
  const root = fixture(`${setup} t("control"); t.rich("newKey");`);
  expect(sourceKeys([root], [])).toEqual(["projectAiResearch.control", "projectAiResearch.newKey"]);
});

it.each([
  'function Row(t: ReturnType<typeof useTranslations<"projectAiResearch">>) { t("control"); }',
  'function Row(props: { localize: ReturnType<typeof useTranslations<"projectAiResearch">> }) { props.localize("control"); }',
])("discovers an explicit translator namespace in a parameter type: %s", (text) => {
  expect(sourceKeys([fixture(text)], [])).toEqual(["projectAiResearch.control"]);
});

it.each(["import type", "import"])(
  "resolves a literal union through %s and refuses unpinned members",
  (keyword) => {
    const root = fixture(`${keyword} { Key } from "./copy";
    ${declaration} t("control"); function Row(key: Key) { t(key); }
  `);
    writeFileSync(join(root, "copy.ts"), 'export type Key = "one" | "two";');
    const pinned = ["projectAiResearch.one", "projectAiResearch.two"];
    expect(sourceKeys([root], pinned)).toEqual(["projectAiResearch.control", ...pinned]);
    expect(() => sourceKeys([root], pinned.slice(1))).toThrow(/Unreviewed translation key/);
  },
);

it("ignores explicitly typed ordinary callbacks beside a translator control", () => {
  const root = fixture(`${declaration} t("control");
    function Row(onChange: (value: string) => void) { onChange("selection"); }
  `);
  expect(sourceKeys([root], [])).toEqual(["projectAiResearch.control"]);
});

it("ignores a local string-to-string formatter beside a translator control", () => {
  const root = fixture(`${declaration} t("control");
    const formatMoment = (value: string) => value;
    t("rangeThrough", { date: formatMoment(view.rangeEnd) });
  `);
  expect(sourceKeys([root], [])).toEqual([
    "projectAiResearch.control",
    "projectAiResearch.rangeThrough",
  ]);
});

it("ignores a function that is not a translator", () => {
  const call = 'const format: (key: string) => string = unknownFactory(); format("missingKey");';
  expect(sourceKeys([fixture(`${declaration} t("control"); ${call}`)], [])).toEqual([
    "projectAiResearch.control",
  ]);
});

it.each([
  'function Row({ format }: { format: (key: string) => string }) { format("missingKey"); } Row({ format: t });',
  'function Row(format: (key: string) => string) { format("missingKey"); } Row(t);',
  'function Row(props: { format: (key: string) => string }) { props.format("missingKey"); } Row({ format: t });',
  'function Row({ format }: { format: (key: string, values?: Record<string, string>) => string }) { format("missingKey"); } <Row format={t} />',
  'function Row({ format }: { format: (key?: string) => string }) { format("missingKey"); } Row({ format: t });',
  'function Row({ format }: { format: { (key: string): string; (key: string, values: Record<string, string>): string } }) { format("missingKey"); } Row({ format: t });',
  'function Row({ format }: { format: <Key extends string>(key: Key) => string }) { format("missingKey"); } Row({ format: t });',
  'function Row({ format }: { format: ((key: string) => string) | ((key: string, values?: Record<string, string>) => string) }) { format("missingKey"); } Row({ format: t });',
  'function Row({ format }: { format: ((key: string) => string) & ((key: string, values?: Record<string, string>) => string) }) { format("missingKey"); } Row({ format: t });',
  'const c = t as (k: string) => string; c("missingKey");',
  'const c: any = useTranslations("projectAiResearch"); c("missingKey");',
  'function Row(props: any) { props.t("missingKey"); } Row({ t });',
  'const format: (key: string) => string = t; format("missingKey");',
  'const c = t as any; c("missingKey");',
  'const r = (t as any)("missingKey");',
  'const holder = { t } as any; holder.t("missingKey");',
  'function Row(props: any) { props.t("missingKey"); } const Panel = () => { const t = useTranslations("projectAiResearch"); return <Row t={t} />; };',
  'function Row(...args: any[]) { args[0]("missingKey"); } const run = () => Row(t);',
])("refuses a translator whose type is erased: %s", (call) => {
  expect(() => sourceKeys([fixture(`${declaration} t("control"); ${call}`)], [])).toThrow(
    /Unreviewed translation binding/,
  );
});

it("keeps real formatters that never receive a translator", () => {
  const root = fixture(`${declaration} t("control");
    const formatMoment: (value: string) => string = useCallback((value: string) => value.trim(), []);
    t("rangeThrough", { date: formatMoment(view.rangeEnd) });
    const memoized: (value: string) => string = memoize((value: string) => value.trim());
    memoized(view.rangeEnd);
    const cached: (value: string) => string = useMemo(() => (value: string) => value.trim(), []);
    cached("2020-01-01");
    const bound: (value: string) => string = formatMoment.bind(null);
    bound(view.rangeEnd);
    function Row(formatDate: (iso: string) => string) { formatDate(view.rangeEnd); formatDate("2020-01-01"); }
    Row(formatMoment);
    const formatters: { [unit: string]: (value: string) => string } = { usd: (value: string) => value };
    formatters[unit](view.rangeEnd);
    formatters["usd"]("12.00");
  `);
  expect(sourceKeys([root], [])).toEqual([
    "projectAiResearch.control",
    "projectAiResearch.rangeThrough",
  ]);
});

it("validates every inline dictionary key without inventing a global catalog path", () => {
  const setup = `${declaration} t("control"); const inline = createTranslator({ locale, messages: { providerCount: messages.providerCount } });`;
  expect(
    sourceKeys([fixture(`${setup} inline("providerCount");`)], [], ["projectAiResearch"]),
  ).toEqual(["projectAiResearch.control"]);
  expect(() =>
    sourceKeys([fixture(`${setup} inline("missing");`)], [], ["projectAiResearch"]),
  ).toThrow(/Unreviewed translation key/);
});

it("accepts every sibling string in an inline dictionary", () => {
  const setup = `${declaration} t("control"); const inline = createTranslator({ locale, messages: { apiUnits: messages.apiUnits, searches: messages.searches, units: messages.units } });`;
  expect(
    sourceKeys(
      [fixture(`${setup} inline("apiUnits"); inline("searches"); inline("units");`)],
      [],
      ["projectAiResearch"],
    ),
  ).toEqual(["projectAiResearch.control"]);
});

it("keeps both copies of one inline object", () => {
  const setup = `${declaration} t("control"); const summary = { title: "Title" }; const x = { summary }; const inline = createTranslator({ locale, messages: { a: x.summary, b: x.summary } });`;
  expect(sourceKeys([fixture(`${setup} inline("b.title");`)], [], ["projectAiResearch"])).toEqual([
    "projectAiResearch.control",
  ]);
});

it.each(['namespace: "nested"', "...options"])(
  "refuses inline options that change lookup: %s",
  (extra) => {
    const root = fixture(
      `${declaration} t("control"); const inline = createTranslator({ locale, messages: { providerCount: messages.providerCount }, ${extra} }); inline("providerCount");`,
    );
    expect(() => sourceKeys([root], [])).toThrow(/Unreviewed translation binding/);
  },
);

it.each(["...options", "namespace", '[name]: "projectAiResearch"'])(
  "refuses an unproven server namespace: %s",
  (options) => {
    const root = fixture(`const t = await getTranslations({ ${options} }); t("missing");`);
    expect(() => sourceKeys([root], [])).toThrow(/Unreviewed translation namespace/);
  },
);

it("discovers a translator prop in the usual component layout", () => {
  const root = fixture(`
    import { useTranslations } from "next-intl";
    interface RowProps { t: ReturnType<typeof useTranslations<"projectAiResearch">> }
    function Row({ t }: RowProps) { t("fromProp"); }
    export function Parent() {
      const t = useTranslations("projectAiResearch");
      return <Row t={t} />;
    }
  `);
  writeFileSync(
    join(root, "Child.tsx"),
    `import { useTranslations } from "next-intl";
    export function Child({ t }: { t: ReturnType<typeof useTranslations<"projectAiResearch">> }) {
      t("fromChild");
    }`,
  );
  expect(sourceKeys([root], [])).toEqual([
    "projectAiResearch.fromChild",
    "projectAiResearch.fromProp",
  ]);
});

it("discovers an alias and a member call", () => {
  const root = fixture(`
    const t = useTranslations("projectAiResearch");
    const alias = t;
    alias("aliasKey");
    t.rich("richKey");
    t["markup"]("markupKey");
  `);
  expect(sourceKeys([root], [])).toEqual([
    "projectAiResearch.aliasKey",
    "projectAiResearch.markupKey",
    "projectAiResearch.richKey",
  ]);
});

it("refuses a non-literal key and an unpinned namespace", () => {
  const dynamic = fixture(`
    import { useTranslations } from "next-intl";
    const t = useTranslations("projectAiResearch");
    let key: string = "missingKey";
    t(key);
  `);
  const unpinned = fixture(`
    import { useTranslations } from "next-intl";
    const t = useTranslations(namespace);
    t("missing");
  `);
  expect(() => sourceKeys([dynamic], [])).toThrow(/Unreviewed translation key/);
  expect(() => sourceKeys([unpinned], [])).toThrow(/Unreviewed translation namespace/);
});

it("discovers a translator taken from an unannotated destructure", () => {
  const root = fixture(
    'const { t } = { t: useTranslations("projectAiResearch") }; t("control"); t.rich("newKey");',
  );
  expect(sourceKeys([root], [])).toEqual(["projectAiResearch.control", "projectAiResearch.newKey"]);
});

it("discovers a translator taken from a typed hook return", () => {
  const root = fixture(`
    function useCopy(): { t: ReturnType<typeof useTranslations<"projectAiResearch">> } {
      const t = useTranslations("projectAiResearch");
      return { t };
    }
    const { t } = useCopy();
    t("control");
    t.rich("newKey");
  `);
  expect(sourceKeys([root], [])).toEqual(["projectAiResearch.control", "projectAiResearch.newKey"]);
});

it("reads a helper kept outside the scanned directory", () => {
  const root = mkdtempSync(join(tmpdir(), "locale-source-"));
  roots.push(root);
  const scanned = join(root, "app");
  mkdirSync(scanned);
  mkdirSync(join(root, "lib"));
  writeFileSync(
    join(scanned, "Component.tsx"),
    `import { useTranslations } from "next-intl";
import { label } from "../lib/label";
const t = useTranslations("projectAiResearch");
label(t);
t("control");
`,
  );
  writeFileSync(
    join(root, "lib", "label.ts"),
    `import type { useTranslations } from "next-intl";
export function label(t: ReturnType<typeof useTranslations<"projectAiResearch">>) {
  return t("missingKey");
}
`,
  );
  expect(sourceKeys([scanned], [])).toEqual([
    "projectAiResearch.control",
    "projectAiResearch.missingKey",
  ]);
});

it.each([
  'function Row({ rich }: ReturnType<typeof useTranslations<"projectAiResearch">>) { rich("missingKey"); } Row(t);',
  'const { t: { rich } } = { t }; rich("missingKey");',
  `function useCopy(): { t: ReturnType<typeof useTranslations<"projectAiResearch">> } {
    const t = useTranslations("projectAiResearch");
    return { t };
  }
  const { t: { rich } } = useCopy();
  rich("missingKey");`,
])("refuses a binding pattern taken from a translator: %s", (call) => {
  expect(() => sourceKeys([fixture(`${declaration} t("control"); ${call}`)], [])).toThrow(
    /Unreviewed translation binding/,
  );
});

it("names the fail-closed binding forms", () => {
  const root = fixture(
    `${declaration} function Row(copy?: ReturnType<typeof useTranslations<"projectAiResearch">>) { if (!copy) return; copy("missingKey"); }`,
  );
  expect(() => sourceKeys([root], [])).toThrow(
    /Fail closed for an early return, memo\/forwardRef\/FC props, a rest translator parameter, or a truthiness check of an optional translator/,
  );
});

it("discovers a renamed translator from a typed hook return", () => {
  const root = fixture(`
    function useCopy(): { t: ReturnType<typeof useTranslations<"projectAiResearch">> } {
      const t = useTranslations("projectAiResearch");
      return { t };
    }
    const { t: copy } = useCopy();
    copy("control");
    copy.rich("newKey");
  `);
  expect(sourceKeys([root], [])).toEqual(["projectAiResearch.control", "projectAiResearch.newKey"]);
});

it.each(["jpeg", "gif", "ico", "avif", "woff", "ttf"])(
  "resolves a local .%s asset import",
  (extension) => {
    const root = fixture(`import "./mark.${extension}";\n${declaration} t("control");`);
    writeFileSync(join(root, `mark.${extension}`), "");
    expect(sourceKeys([root], [])).toEqual(["projectAiResearch.control"]);
  },
);

it("refuses a translator passed through a generic parameter", () => {
  const root = fixture(
    `${declaration} t("control"); function label<T extends (key: string) => string>(translate: T) { translate("missingKey"); } label(t);`,
  );
  expect(() => sourceKeys([root], [])).toThrow(/Unreviewed translation binding/);
}, 20_000);

it("uses the namespace passed by the caller", () => {
  const root = fixture(`
    function Row({ t }: { t: ReturnType<typeof useTranslations<"projectAiResearch">> }) {
      t("runLabel");
    }
    <Row t={useTranslations("projectAiResearch.modelPlayground")} />;
  `);
  expect(() => sourceKeys([root], [])).toThrow(/Unreviewed translation binding/);
});

it("does not record a key that is only checked with has", () => {
  const root = fixture(`${declaration} t("control"); t.has("note");`);
  expect(sourceKeys([root], [])).toEqual(["projectAiResearch.control"]);
});

it("treats a key used only inside a has guard as optional", () => {
  const root = fixture(`${declaration} t("control"); t.has("note") ? t("note") : null;`);
  expect(sourceKeys([root], [])).toEqual(["projectAiResearch.control"]);
});

it.each([
  'function Row({ format }: { format: (key: string) => string }) { format("missingKey"); } const props = { format: t }; Row(props);',
  'function Row({ format }: { format: (key: string) => string }) { format("missingKey"); } const props = { format: t }; <Row {...props} />;',
  'function useCopy() { const t = useTranslations("projectAiResearch"); return { t }; } function Row({ t }: { t: (key: string) => string }) { t("missingKey"); } const value = useCopy(); Row(value);',
  'function Row(items: ((key: string) => string)[]) { items[0]("missingKey"); } const items = [t]; Row(items);',
])("refuses a translator carried in a container: %s", (call) => {
  expect(() => sourceKeys([fixture(`${declaration} t("control"); ${call}`)], [])).toThrow(
    /Unreviewed translation binding/,
  );
});

it.each([
  'function Row(holder: any) { holder.t("missingKey"); } const holder = { t }; Row(holder);',
  'const holder = { t }; (holder as any).t("missingKey");',
  'function Row<P extends { format: (key: string) => string }>(props: P) { props.format("missingKey"); } const props = { format: t }; Row(props);',
  'function label<T extends ReturnType<typeof useTranslations<"projectAiResearch">>>(translate: T) { translate.call(undefined, "missingKey"); } label(t);',
  'const props = { get format() { return t; } }; function Row(props: { format: (key: string) => string }) { props.format("missingKey"); } Row(props);',
  'const entries = new Map([["t", t]]); function Row(entries: Map<string, (key: string) => string>) { entries.get("t")!("missingKey"); } Row(entries);',
  'function Row(props: { a: { b: { c: { d: { e: (key: string) => string } } } } }) { props.a.b.c.d.e("missingKey"); } const props = { a: { b: { c: { d: { e: t } } } } }; Row(props);',
  'type A = ReturnType<typeof useTranslations<"projectAiResearch">>; type B = ReturnType<typeof useTranslations<"projectIntegrations.oauth">>; function read(value: A | B) { const y: (key: string) => string = value; y("missingKey"); }',
  'const copies = { row: t }; copies.row("missingKey");',
  'import { useMemo } from "react"; const memoized = useMemo(() => t, [t]); memoized("missingKey");',
  'import { useCallback } from "react"; const forwarded = useCallback(t, [t]); forwarded("missingKey");',
])("refuses a translator outside an allowed position: %s", (call) => {
  expect(() => sourceKeys([fixture(`${declaration} t("control"); ${call}`)], [])).toThrow(
    /Unreviewed translation binding/,
  );
});

it("refuses a local script import", () => {
  const root = fixture(`
    import { useCopy } from "./copy.js";
    const t = useCopy();
    t("missingKey");
  `);
  writeFileSync(join(root, "copy.js"), "export function useCopy() { return (key) => key; }\n");
  expect(() => sourceKeys([root], [])).toThrow(/Unreviewed translation binding/);
});

it("refuses a translator stashed outside a react dependency list", () => {
  const root = fixture(
    `${declaration} t("control"); function stash(_count: number, items: unknown[]) { return items[0] as (key: string) => string; } stash(0, [t])("missingKey");`,
  );
  expect(() => sourceKeys([root], [])).toThrow(/Unreviewed translation binding/);
});

it("checks nested inline catalog keys against the leaf shape", () => {
  const setup = `${declaration} t("control"); const inline = createTranslator({ locale, messages: { section: { label: "Label" } } });`;
  expect(
    sourceKeys([fixture(`${setup} inline("section.label");`)], [], ["projectAiResearch"]),
  ).toEqual(["projectAiResearch.control"]);
  expect(() =>
    sourceKeys([fixture(`${setup} inline("section");`)], [], ["projectAiResearch"]),
  ).toThrow(/Unreviewed translation key/);
});

it("discovers a translator returned by a local helper", () => {
  const root = fixture(`
    import { usePlaygroundCopy } from "./hooks/use-playground-copy";
    const t = usePlaygroundCopy();
    t("missingKey");
  `);
  mkdirSync(join(root, "hooks"));
  writeFileSync(
    join(root, "hooks/use-playground-copy.ts"),
    'import { useTranslations } from "next-intl";\nexport const usePlaygroundCopy = (): ReturnType<typeof useTranslations<"projectAiResearch.modelPlayground">> => useTranslations("projectAiResearch.modelPlayground");\n',
  );
  expect(sourceKeys([root], [])).toEqual(["projectAiResearch.modelPlayground.missingKey"]);
});

it("refuses a local import that does not resolve", () => {
  const root = fixture('import { missing } from "./missing-helper"; t("control");');
  expect(() => sourceKeys([root], [])).toThrow(/Unreviewed translation binding/);
});

it("discovers a translator exported through a barrel", () => {
  const root = fixture(`
    import { usePlaygroundCopy } from "./hooks";
    const t = usePlaygroundCopy();
    t("missingKey");
  `);
  mkdirSync(join(root, "hooks"));
  writeFileSync(
    join(root, "hooks/index.ts"),
    'export { usePlaygroundCopy } from "./use-playground-copy";\n',
  );
  writeFileSync(
    join(root, "hooks/use-playground-copy.ts"),
    'import { useTranslations } from "next-intl";\nexport const usePlaygroundCopy = (): ReturnType<typeof useTranslations<"projectAiResearch.modelPlayground">> => useTranslations("projectAiResearch.modelPlayground");\n',
  );
  expect(sourceKeys([root], [])).toEqual(["projectAiResearch.modelPlayground.missingKey"]);
});

it("discovers a translator returned through two local helpers", () => {
  const root = fixture(`
    import { useOuter } from "./outer";
    const t = useOuter();
    t("missingKey");
  `);
  writeFileSync(
    join(root, "outer.ts"),
    'import type { useTranslations } from "next-intl";\nimport { usePlaygroundCopy } from "./use-playground-copy";\nexport const useOuter = (): ReturnType<typeof useTranslations<"projectAiResearch.modelPlayground">> => usePlaygroundCopy();\n',
  );
  writeFileSync(
    join(root, "use-playground-copy.ts"),
    'import { useTranslations } from "next-intl";\nexport const usePlaygroundCopy = (): ReturnType<typeof useTranslations<"projectAiResearch.modelPlayground">> => useTranslations("projectAiResearch.modelPlayground");\n',
  );
  expect(sourceKeys([root], [])).toEqual(["projectAiResearch.modelPlayground.missingKey"]);
});

it("resolves a path alias and a package asset import", () => {
  const root = fixture(`
    import "@/components/ai-research/ModelPlaygroundLoading.module.css";
    import "next/font/google/target.css";
    ${declaration}
    t("control");
  `);
  expect(sourceKeys([root], [])).toEqual(["projectAiResearch.control"]);
});

it("keeps an awaited server translator", () => {
  const root = fixture(`
    const t: Awaited<ReturnType<typeof getTranslations<"projectAiResearch">>> = await getTranslations("projectAiResearch");
    t("control");
    async function load(): Promise<ReturnType<typeof getTranslations<"projectAiResearch">>> {
      return getTranslations("projectAiResearch");
    }
    const loaded = await load();
    loaded("loadedKey");
  `);
  expect(sourceKeys([root], [])).toEqual([
    "projectAiResearch.control",
    "projectAiResearch.loadedKey",
  ]);
});

it("does not refuse a real formatter called with a literal", () => {
  const root = fixture(`
    import { useTranslations } from "next-intl";
    const t = useTranslations("projectAiResearch");
    t("control");
    const format: (value: string) => string = makeSlugger("en");
    format("Model playground");
    const capitalize = lodash.capitalize;
    capitalize("usd");
  `);
  expect(sourceKeys([root], [])).toEqual(["projectAiResearch.control"]);
});
