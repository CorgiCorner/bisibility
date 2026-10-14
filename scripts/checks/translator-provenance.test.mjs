import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { discoverScopedSources, findUncatalogedUiStrings } from "./check-ui-i18n-boundaries.mjs";

const modules = {
  "./parts": `import { useTranslations } from "next-intl";
export function presentation() { const t = useTranslations("x"); return { t }; }
export function mutable() { let t = useTranslations("x"); return { t }; }
export function fake() { const t = (key) => key; return { t }; }
export function mixed(flag) { const t = useTranslations("x"); if (flag) return { t }; return { t: (key) => key }; }
export function spread() { const t = useTranslations("x"); return { ...other, t }; }`,
  "./sections": `import type { useTranslations, _Translator } from "next-intl";
export type Shell = ReturnType<typeof useTranslations<"s">>;
export type Native = _Translator<Messages, "s">;
export type Fake = (key: string) => string;
export type Props = { translate: Shell };
export type FakeProps = { translate: Fake };`,
  "./cycle-a": `import { cycleB } from "./cycle-b";
export function cycleA() { const { t } = cycleB(); return { t }; }`,
  "./cycle-b": `import { cycleA } from "./cycle-a";
export function cycleB() { const { t } = cycleA(); return { t }; }`,
};
const resolveModule = (specifier) =>
  modules[specifier] && { fileName: specifier, code: modules[specifier] };
const strings = (code, options = { resolveModule }) =>
  findUncatalogedUiStrings("fixture.tsx", code, options).map((candidate) => candidate.text);

test("proves a hoisted local async wrapper from all actual trusted returns", () => {
  assert.deepEqual(
    strings(`import { createIntlTranslator } from "@/i18n/translator.server";
function Message(t: Awaited<ReturnType<typeof make>>) { return <p>{t("catalog.key")}</p>; }
async function make() { const messages = await load(); return createIntlTranslator("en", messages); }`),
    [],
  );
});

test("proves imported object-return translator through immutable destructuring", () => {
  assert.deepEqual(
    strings(`import { presentation } from "./parts";
function Message() { const { t: translate } = presentation(); return <p>{translate(flag ? "catalog.first" : "catalog.second")}</p>; }`),
    [],
  );
});

test("proves imported native aliases and contextual callback signatures", () => {
  assert.deepEqual(
    strings(`import { type Shell, type Native } from "./sections";
function entry(copy: (t: Shell) => string) { return copy; }
const entries = entry(t => <p>{t("catalog.entry")}</p>);
function NativeMessage(t: Native) { return <p>{t("catalog.native")}</p>; }`),
    [],
  );
});

test("refuses helper imports without a source resolver", () => {
  assert.deepEqual(
    strings(
      `import { presentation } from "./parts";
function Message() { const { t } = presentation(); return <p>{t("Unproven label")}</p>; }`,
      {},
    ),
    ["Unproven label"],
  );
});

for (const helper of ["mutable", "fake", "mixed", "spread"]) {
  test(`refuses the ${helper} imported helper`, () => {
    assert.deepEqual(
      strings(`import { ${helper} } from "./parts";
function Message() { const { t } = ${helper}(); return <p>{t("Unproven label")}</p>; }`),
      ["Unproven label"],
    );
  });
}

test("refuses reassignment, mixed returns, local cycles and generic alias shadowing", () => {
  assert.deepEqual(
    strings(`import { createIntlTranslator } from "@/i18n/translator.server";
import type { Shell } from "./sections";
function make() { return createIntlTranslator("en", {}); }
make = () => key => key;
function Assigned(t: ReturnType<typeof make>) { return <p>{t("Assigned label")}</p>; }
function mixed(flag) { if (flag) return createIntlTranslator("en", {}); return key => key; }
function Mixed(t: ReturnType<typeof mixed>) { return <p>{t("Mixed label")}</p>; }
function a() { return b(); } function b() { return a(); }
function Cycle(t: ReturnType<typeof a>) { return <p>{t("Cycle label")}</p>; }
function Shadow<Shell>(t: Shell) { return <p>{t("Shadowed label")}</p>; }`),
    ["Assigned label", "Mixed label", "Cycle label", "Shadowed label"],
  );
});

test("refuses local utility type aliases even when declared after their use", () => {
  for (const utility of ["ReturnType", "Awaited", "Promise"]) {
    const type = utility === "ReturnType" ? "typeof make" : "ReturnType<typeof make>";
    assert.deepEqual(
      strings(`import { createIntlTranslator } from "@/i18n/translator.server";
function make() { return createIntlTranslator("en", {}); }
function Page(t: ${utility}<${type}>) { return <p>{t("Unproven label")}</p>; }
type ${utility}<T> = (key: string) => string;`),
      ["Unproven label"],
      utility,
    );
  }
});

test("refuses a locally shadowed readonly wrapper around translator props", () => {
  assert.deepEqual(
    strings(`import type { Props } from "./sections";
function Page(props: Readonly<Props>) { const { translate: t } = props; return <p>{t("Unproven label")}</p>; }
type Readonly<T> = { translate: (key: string) => string };`),
    ["Unproven label"],
  );
});

test("refuses imported and local interface utility shadows", () => {
  const code = `import { createIntlTranslator } from "@/i18n/translator.server";
function make() { return createIntlTranslator("en", {}); }
function Page(t: ReturnType<typeof make>) { return <p>{t("Unproven label")}</p>; }`;
  assert.deepEqual(strings(`${code}\ninterface ReturnType<T> { (key: string): string; }`), [
    "Unproven label",
  ]);
  assert.deepEqual(
    strings(`import type { ReturnType } from "./utility";\n${code}`, {
      resolveModule: () => ({
        fileName: "./utility",
        code: "export type ReturnType<T> = (key: string) => string;",
      }),
    }),
    ["Unproven label"],
  );
});

test("refuses import cycles and lexical translator shadowing", () => {
  assert.deepEqual(
    strings(`import { cycleA } from "./cycle-a";
import { presentation } from "./parts";
function Cycle() { const { t } = cycleA(); return <p>{t("Import cycle label")}</p>; }
function Shadow() { const { t } = presentation(); { const t = key => key; return <p>{t("Shadowed label")}</p>; } }`),
    ["Import cycle label", "Shadowed label"],
  );
});

test("proves exactly the translator slots of an unshadowed Promise.all", () => {
  assert.deepEqual(
    strings(`import { getTranslations } from "next-intl/server";
async function Page() { const [t, other] = await Promise.all([getTranslations("scope"), load()]); return <p>{t("catalog.key")}{other("Unproven label")}</p>; }`),
    ["Unproven label"],
  );
  assert.deepEqual(
    strings(`import { getTranslations } from "next-intl/server";
async function Page(Promise) { const [t] = await Promise.all([getTranslations("scope")]); return <p>{t("Unproven label")}</p>; }`),
    ["Unproven label"],
  );
});

test("proves imported prop aliases through readonly parameter destructuring", () => {
  assert.deepEqual(
    strings(`import type { Props, FakeProps } from "./sections";
function Real(props: Readonly<Props>) { const { translate: t } = props; return <p>{t("catalog.key")}</p>; }
function Fake(props: Readonly<FakeProps>) { const { translate: t } = props; return <p>{t("Fake label")}</p>; }
function Changed(props: Props) { props.translate = key => key; const { translate: t } = props; return <p>{t("Changed label")}</p>; }`),
    ["Fake label", "Changed label"],
  );
});

test("excludes explicit test-fixture suffixes while retaining production fixture components", async () => {
  const root = await mkdtemp(join(tmpdir(), "ui-fixture-scope-"));
  try {
    await mkdir(join(root, "components"));
    await writeFile(
      join(root, "components", "FixtureCard.tsx"),
      `export const FixtureCard = () => <p>Reader copy</p>;`,
    );
    await writeFile(
      join(root, "components", "recurring-ui.test-fixture.tsx"),
      `export const Fixture = () => <p>Test-only copy</p>;`,
    );
    const sources = await discoverScopedSources(root);
    assert.deepEqual(
      sources.map((source) => source.path),
      ["components/FixtureCard.tsx"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const [producer, expected] of [
  [`return (key) => { switch (key) { case "save": return t(key); default: return t(key); } };`, []],
  [`return (key) => { if (key === "save") return t(key); return key; };`, ["Unproven label"]],
  [`return (key) => { if (key === "save") return t(key); };`, ["Unproven label"]],
  [`return (key) => { switch (key) { case "save": return t(key); } };`, ["Unproven label"]],
  [
    `return (key) => { switch (key) { case "save": break; default: return t(key); } };`,
    ["Unproven label"],
  ],
  [`const t = (key) => key; return (key) => t(key);`, ["Unproven label"]],
]) {
  test(`requires every callable host-contract return to originate in the real translator: ${producer}`, () => {
    const sourceModules = {
      "./contract": `export type Host = (key: string) => string;`,
      "./producer": `import type { useTranslations } from "next-intl";
import type { Host } from "./contract";
export function adapt(${producer.startsWith("const t") ? "ignored" : "t"}: ReturnType<typeof useTranslations>): Host { ${producer} }`,
    };
    const resolver = (specifier) =>
      sourceModules[specifier] && { fileName: specifier, code: sourceModules[specifier] };
    assert.deepEqual(
      strings(
        `import type { Host } from "./contract";
function Page(t: Host) { return <p>{t("Unproven label")}</p>; }`,
        {
          resolveModule: resolver,
          translatorContracts: [
            { module: "./contract", type: "Host", producerModule: "./producer", producer: "adapt" },
          ],
        },
      ),
      expected,
    );
  });
}
