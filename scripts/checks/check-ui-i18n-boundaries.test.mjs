import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import {
  checkUiI18nBoundaries,
  findUncatalogedUiStrings,
  writeUiI18nRegistry,
} from "./check-ui-i18n-boundaries.mjs";

const fixtureRoot = resolve(import.meta.dirname, "fixtures/ui-i18n-boundaries");

async function writeRootFile(root, path, source) {
  const target = resolve(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, source);
}

async function createInventoryFixture() {
  const root = await mkdtemp(resolve(tmpdir(), "ui-i18n-boundaries-"));
  await writeRootFile(
    root,
    "app/(regional)/app/page.tsx",
    'import { useTranslations } from "next-intl";\nexport default function AppPage() { const t = useTranslations("app"); return <main>{t("title")}</main>; }\n',
  );
  await writeRootFile(
    root,
    "components/Example.tsx",
    'import { useTranslations } from "next-intl";\nexport const Example = () => { const t = useTranslations("example"); return <button>{t("save")}</button>; };\n',
  );
  const registryPath = resolve(root, "i18n/ui-surface-registry.json");
  await mkdir(dirname(registryPath), { recursive: true });
  await writeFile(
    registryPath,
    JSON.stringify({ exceptions: [], schemaVersion: 1, sources: [] }, null, 2),
  );
  await writeUiI18nRegistry({ registryPath, root });
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  registry.sources = registry.sources.map((source) =>
    source.path === "components/Example.tsx" ? { ...source, status: "migrated" } : source,
  );
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  return { registryPath, root };
}

async function withInventoryFixture(callback) {
  const fixture = await createInventoryFixture();
  try {
    await callback(fixture);
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
}

test("detects rendered conditional and logical branch strings", () => {
  const candidates = findUncatalogedUiStrings(
    "fixture.tsx",
    'export const A = ({ ready }) => <p>{ready ? "Ready now" : "Try again"}{ready && " Saved"}</p>;',
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.kind),
    ["jsx-expression", "jsx-expression", "jsx-expression"],
  );
});

test("resolves immutable copy from a rendered logical descendant", () => {
  const candidates = findUncatalogedUiStrings(
    "fixture.tsx",
    [
      "function A({ ready }) {",
      '  const heading = "Welcome aboard";',
      "  return <h1>{ready && heading}</h1>;",
      "}",
    ].join("\n"),
  );

  assert.deepEqual(candidates.map((candidate) => [candidate.kind, candidate.text]), [
    ["jsx-expression", "Welcome aboard"],
  ]);
});

test("resolves immutable copy from a rendered conditional descendant", () => {
  const candidates = findUncatalogedUiStrings(
    "fixture.tsx",
    [
      "function A({ ready }) {",
      '  const heading = "Welcome aboard";',
      '  const fallback = "Try again";',
      "  return <h1>{ready ? heading : fallback}</h1>;",
      "}",
    ].join("\n"),
  );

  assert.deepEqual(candidates.map((candidate) => [candidate.kind, candidate.text]), [
    ["jsx-expression", "Welcome aboard"],
    ["jsx-expression", "Try again"],
  ]);
});

test("scans rendered rich callbacks but excludes proven keys and ICU values", () => {
  const candidates = findUncatalogedUiStrings(
    "fixture.tsx",
    [
      'import { useTranslations } from "next-intl";',
      "function A() {",
      '  const t = useTranslations("x");',
      '  return <p>{t.rich("message", {',
      '    count: "ICU value data",',
      '    link: (chunks) => <a aria-label={"English label"}>Read the docs{"Read inline"}{chunks}</a>,',
      "  })}</p>;",
      "}",
    ].join("\n"),
  );

  assert.deepEqual(candidates.map((candidate) => [candidate.kind, candidate.text]), [
    ["accessible-attribute", "English label"],
    ["jsx-text", "Read the docs"],
    ["jsx-expression", "Read inline"],
  ]);
});

test("does not trust fake or shadowed rich translators", () => {
  const candidates = findUncatalogedUiStrings(
    "fixture.tsx",
    [
      "export function Fake() {",
      "  const t = (value) => value;",
      '  return <p>{t.rich("fake key", { link: (chunks) => <a aria-label={"Fake label"}>Fake callback text{chunks}</a> })}</p>;',
      "}",
      "export function Shadowed({ t }) {",
      '  return <p>{t.rich("shadowed key", { link: (chunks) => <a aria-label={"Shadowed label"}>Shadowed callback text{chunks}</a> })}</p>;',
      "}",
    ].join("\n"),
  );

  assert.deepEqual(candidates.map((candidate) => candidate.text), [
    "fake key",
    "Fake label",
    "Fake callback text",
    "shadowed key",
    "Shadowed label",
    "Shadowed callback text",
  ]);
});

test("recognizes only explicitly proven extension translator factories", () => {
  const moduleSpecifier = ["@/lib", "private-adapters", "i18n-translator.server"].join("/");
  const source = [
    `import { createHostedIntlTranslator } from "${moduleSpecifier}";`,
    "function A(locale, messages) {",
    "  const t = createHostedIntlTranslator(locale, messages);",
    '  return <p>{t("message")}</p>;',
    "}",
  ].join("\n");

  assert.deepEqual(
    findUncatalogedUiStrings("fixture.tsx", source).map((candidate) => candidate.text),
    ["message"],
  );

  const candidates = findUncatalogedUiStrings(
    "fixture.tsx",
    source,
    {
      translatorFactories: new Map([[moduleSpecifier, new Set(["createHostedIntlTranslator"])]]),
    },
  );

  assert.deepEqual(candidates, []);
  assert.deepEqual(
    findUncatalogedUiStrings("fixture.tsx", source.replaceAll("createHostedIntlTranslator", "unexpectedFactory"), {
      translatorFactories: new Map([[moduleSpecifier, new Set(["createHostedIntlTranslator"])]]),
    }).map((candidate) => candidate.text),
    ["message"],
  );
});

test("resolves only imported translator factories and their local aliases", () => {
  const candidates = findUncatalogedUiStrings(
    "fixture.tsx",
    [
      'import { useTranslations as useAppTranslations } from "next-intl";',
      "export function Screen({ workspaceName }) {",
      '  const kpiT = useAppTranslations("dashboard");',
      "  const dashboardT = kpiT;",
      "  const t = (value) => value;",
      '  const heading = workspaceName ? "Welcome to your new project" : `Welcome to ${workspaceName}`;',
      '  return <section aria-label={dashboardT("kpisAriaLabel")}><p>{t("Fake translation label")}</p><h2>{heading}</h2></section>;',
      "}",
      "export function Shadowed({ t }) { return <p>{t(\"Shadowed translator label\")}</p>; }",
    ].join("\n"),
  );

  assert.deepEqual(
    candidates.map((candidate) => candidate.text),
    [
      "Fake translation label",
      "Welcome to your new project",
      "Welcome to ${workspaceName}",
      "Shadowed translator label",
    ],
  );
});

test("recognizes translator parameters proven by local return-type aliases", () => {
  const candidates = findUncatalogedUiStrings(
    "fixture.tsx",
    [
      'import type { useTranslations } from "next-intl";',
      'type KpiTranslations = ReturnType<typeof useTranslations<"projectDashboard.kpis">>;',
      "type NoticesTranslations = KpiTranslations;",
      "export function KpiCard(kpiT: KpiTranslations) {",
      '  return <section aria-label={kpiT("kpisAriaLabel")}>{kpiT.rich("kpisRichLabel")}{kpiT.markup("kpisMarkupLabel")}</section>;',
      "}",
      "export function emptyRankNotice({ t }: { t: NoticesTranslations }) {",
      '  return { detail: t("emptyDetail"), title: t("emptyTitle") };',
      "}",
      "export function Fake({ t }: { t: (key: string) => string }) {",
      '  return <p>{t("Fake typed translator label")}</p>;',
      "}",
    ].join("\n"),
  );

  assert.deepEqual(candidates.map((candidate) => candidate.text), ["Fake typed translator label"]);
});

test("ignores stable feedback options, validation metadata and enum comparisons", () => {
  const candidates = findUncatalogedUiStrings(
    "fixture.tsx",
    [
      'import { useTranslations } from "next-intl";',
      'function A(direction) { const t = useTranslations("x");',
      'showToast(t("saved"), { severity: "success" });',
      'form.setError("target", { message: t("invalidTarget"), type: "server" });',
      'return direction === "to-cloud" ? t("cloud") : t("selfHost"); }',
    ].join("\n"),
  );

  assert.deepEqual(candidates, []);
});

test("follows local immutable copy only from visible and accessible sinks", () => {
  const candidates = findUncatalogedUiStrings(
    "fixture.tsx",
    [
      "export function OverviewEmpty({ workspaceName, useDefault }) {",
      '  const heading = useDefault ? "Welcome to your new project" : `Welcome to ${workspaceName}`;',
      '  const ariaLabel = "Overview KPIs";',
      '  const className = useDefault ? "text-fg" : "text-fg-muted";',
      '  const destination = useDefault ? "https://example.com/overview" : "mailto:hello@example.org";',
      "  const cyclic = cyclic;",
      "  console.info(heading, destination);",
      '  return <section aria-label={ariaLabel} className={className}><a href={destination}><h2>{heading}</h2><span>{cyclic}</span></a></section>;',
      "}",
    ].join("\n"),
  );

  assert.deepEqual(
    candidates.map((candidate) => [candidate.kind, candidate.text]),
    [
      ["accessible-attribute", "Overview KPIs"],
      ["jsx-expression", "Welcome to your new project"],
      ["jsx-expression", "Welcome to ${workspaceName}"],
    ],
  );
});

test("detects accessible text, UI feedback and form-validation messages", () => {
  const candidates = findUncatalogedUiStrings(
    "fixture.tsx",
    [
      'export const A = () => <button aria-label="Close panel" />;',
      'toast.error("Could not save settings");',
      'form.setError("email", { message: "Use a valid email address" });',
    ].join("\n"),
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.kind),
    ["accessible-attribute", "ui-feedback", "validation-message"],
  );
});

test("detects English-pinned formatters", () => {
  const candidates = findUncatalogedUiStrings(
    "fixture.tsx",
    'export const label = new Intl.DateTimeFormat("en-US").format(new Date());\nexport const date = new Date().toLocaleString("en-US");',
  );
  assert.equal(candidates.filter((candidate) => candidate.kind === "english-pinned-formatter").length, 2);
});

test("scans imported UI view-model prose only in UI-data mode", async () => {
  const source = await readFile(resolve(fixtureRoot, "view-model.ts"), "utf8");
  assert.equal(findUncatalogedUiStrings("view-model.ts", source).length, 1);
  assert.deepEqual(
    findUncatalogedUiStrings("view-model.ts", source, { mode: "ui-data" }).map((candidate) => candidate.kind),
    ["ui-data"],
  );
});

test("keeps reachable UI data registered after its prose becomes a translation call", async () => {
  await withInventoryFixture(async ({ registryPath, root }) => {
    await writeRootFile(
      root,
      "components/Example.tsx",
      'import { accountViewModel } from "./view-model";\nexport const Example = () => <button>{accountViewModel.label}</button>;\n',
    );
    await writeRootFile(
      root,
      "components/view-model.ts",
      'export const accountViewModel = { id: "account", href: "https://example.com/account", label: "Save settings" };\n',
    );
    await writeUiI18nRegistry({ registryPath, root });

    let registry = JSON.parse(await readFile(registryPath, "utf8"));
    registry.sources = registry.sources.map((source) =>
      source.path === "components/view-model.ts" || source.path === "components/Example.tsx"
        ? { ...source, status: "migrated" }
        : source,
    );
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    let result = await checkUiI18nBoundaries({ registryPath, root });
    assert.match(result.errors.join("\n"), /components\/view-model\.ts:1 ui-data/u);

    await writeRootFile(
      root,
      "components/view-model.ts",
      'import { createIntlTranslator } from "@/i18n/translator.server";\nconst t = createIntlTranslator(locale, messages);\nexport const accountViewModel = { id: "account", href: "https://example.com/account", label: t("account.save") };\n',
    );
    await writeUiI18nRegistry({ registryPath, root });
    registry = JSON.parse(await readFile(registryPath, "utf8"));
    assert.equal(registry.sources.find((source) => source.path === "components/view-model.ts")?.kind, "ui-data");
    registry.sources = registry.sources.map((source) =>
      source.path === "components/view-model.ts" || source.path === "components/Example.tsx"
        ? { ...source, status: "migrated" }
        : source,
    );
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    result = await checkUiI18nBoundaries({ registryPath, root });
    assert.deepEqual(result.errors, []);

    await writeRootFile(
      root,
      "components/view-model.ts",
      'export const accountViewModel = { id: "account", href: "https://example.com/account", label: "Save settings" };\n',
    );
    result = await checkUiI18nBoundaries({ registryPath, root });
    assert.match(result.errors.join("\n"), /components\/view-model\.ts:1 ui-data/u);
  });
});

test("does not follow type-only imports into UI data inventory", async () => {
  await withInventoryFixture(async ({ registryPath, root }) => {
    await writeRootFile(
      root,
      "components/Example.tsx",
      'import type { AccountViewModel } from "./type-only";\nexport const Example = () => <button>{t("example.save")}</button>;\n',
    );
    await writeRootFile(
      root,
      "components/type-only.ts",
      'export type AccountViewModel = { label: string };\nexport const ignored = { label: "Never rendered" };\n',
    );
    await writeUiI18nRegistry({ registryPath, root });
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    assert.equal(registry.sources.some((source) => source.path === "components/type-only.ts"), false);
  });
});

test("uses template contexts without treating href and CSS templates as prose", () => {
  const candidates = findUncatalogedUiStrings(
    "fixture.tsx",
    [
      'export const A = ({ state, user }) => <a className={`button-${state}`} href={`https://example.com/${user.id}`}>{`Welcome ${user.name}`}</a>;',
      'toast.error(`Could not save ${state}`);',
    ].join("\n"),
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.kind),
    ["jsx-expression", "ui-feedback"],
  );
});

test("does not flag translation keys, links, class names, logs, protocols or user data", () => {
  const candidates = findUncatalogedUiStrings(
    "fixture.tsx",
    [
      'import { useTranslations } from "next-intl";',
      'export const A = ({ user }) => { const t = useTranslations("nav"); return <a className="text-muted" href="https://example.com/docs">{t("docs")}{user.name}</a>; };',
      'console.info(`Saved ${user.id}`);',
      'const callback = "mailto:hello@example.org";',
    ].join("\n"),
  );
  assert.equal(candidates.length, 0);
});

test("rejects a newly unclassified scoped source", async () => {
  await withInventoryFixture(async ({ registryPath, root }) => {
    await writeRootFile(root, "components/NewScreen.tsx", "export const NewScreen = () => <p />;\n");
    const result = await checkUiI18nBoundaries({ registryPath, root });
    assert.match(result.errors.join("\n"), /Unclassified scoped source: components\/NewScreen\.tsx/u);
  });
});

test("core inventory does not require a hosted extension entry", async () => {
  await withInventoryFixture(async ({ registryPath, root }) => {
    const result = await checkUiI18nBoundaries({ registryPath, root });
    assert.deepEqual(result.errors, []);
  });
});

test("extension inventory follows exact render entries and their shared sources", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ui-i18n-extension-"));
  try {
    await writeRootFile(
      root,
      "app/hosted/page.tsx",
      'import dynamic from "next/dynamic";\nconst HostedScreen = dynamic(() => import("../../private-ui/HostedScreen"));\nexport default function Page() { return <HostedScreen />; }\n',
    );
    await writeRootFile(root, "private-ui/HostedScreen.tsx", 'export const HostedScreen = () => <p>{t("hosted.title")}</p>;\n');
    const registryPath = resolve(root, "private-ui-registry.json");
    await writeFile(
      registryPath,
      `${JSON.stringify(
        {
          exceptions: [],
          schemaVersion: 1,
          scope: {
            declaredUiDataSources: [],
            excludedFamilies: [],
            kind: "extension",
            renderEntries: ["app/hosted/page.tsx"],
            renderSourcePrefixes: ["private-ui/"],
            uiDataPrefixes: ["private-ui/"],
          },
          sources: [],
        },
        null,
        2,
      )}\n`,
    );
    await writeUiI18nRegistry({ registryPath, root, scopeKind: "extension" });
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    assert.deepEqual(
      registry.sources.map((source) => source.path),
      ["app/hosted/page.tsx", "private-ui/HostedScreen.tsx"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("extension registry provenance recognizes the verified translator factory", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ui-i18n-extension-provenance-"));
  const moduleSpecifier = ["@/lib", "private-adapters", "i18n-translator.server"].join("/");
  try {
    await writeRootFile(
      root,
      "app/hosted/page.tsx",
      [
        `import { createHostedIntlTranslator } from "${moduleSpecifier}";`,
        "export default function Page(locale, messages) {",
        "  const t = createHostedIntlTranslator(locale, messages);",
        '  return <p>{t("hosted.title")}</p>;',
        "}",
      ].join("\n"),
    );
    const registryPath = resolve(root, "private-ui-registry.json");
    await writeFile(
      registryPath,
      `${JSON.stringify(
        {
          exceptions: [],
          schemaVersion: 1,
          scope: {
            declaredUiDataSources: [],
            excludedFamilies: [],
            kind: "extension",
            renderEntries: ["app/hosted/page.tsx"],
            renderSourcePrefixes: ["app/hosted/"],
            translatorFactories: [{ exports: ["createHostedIntlTranslator"], module: moduleSpecifier }],
            uiDataPrefixes: ["app/hosted/"],
          },
          sources: [{ kind: "render", path: "app/hosted/page.tsx", status: "migrated" }],
        },
        null,
        2,
      )}\n`,
    );

    const result = await checkUiI18nBoundaries({ registryPath, root, scopeKind: "extension" });
    assert.deepEqual(result.errors, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects stale sources and missing or unused exact exceptions", async () => {
  await withInventoryFixture(async ({ registryPath, root }) => {
    const staleRegistry = JSON.parse(await readFile(registryPath, "utf8"));
    staleRegistry.sources.push({ kind: "render", path: "components/Missing.tsx", status: "pending" });
    await writeFile(registryPath, `${JSON.stringify(staleRegistry, null, 2)}\n`);
    const stale = await checkUiI18nBoundaries({ registryPath, root });
    assert.match(stale.errors.join("\n"), /Stale registry source: components\/Missing\.tsx/u);

    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    registry.sources = registry.sources.filter((source) => source.path !== "components/Missing.tsx");
    registry.sources = registry.sources.map((source) =>
      source.path === "components/Example.tsx" ? { ...source, status: "excluded" } : source,
    );
    registry.exceptions = [
      {
        anchor: "variable:Example",
        fingerprint: "0".repeat(64),
        kind: "jsx-text",
        path: "components/Example.tsx",
        reason: "Fixture-only exact exception proves stale rejection.",
        text: "No longer present",
      },
    ];
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    const unused = await checkUiI18nBoundaries({ registryPath, root });
    assert.match(unused.errors.join("\n"), /Unused or stale exception/u);

    registry.exceptions = [];
    registry.sources = registry.sources.map((source) =>
      source.path === "components/Example.tsx" ? { ...source, status: "migrated" } : source,
    );
    await writeRootFile(root, "components/Example.tsx", "export const Example = () => <button>Save settings</button>;\n");
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    const missing = await checkUiI18nBoundaries({ registryPath, root });
    assert.match(missing.errors.join("\n"), /components\/Example\.tsx:1 jsx-text/u);
  });
});

test("rejects a blanket directory exception", async () => {
  await withInventoryFixture(async ({ registryPath, root }) => {
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    registry.sources = registry.sources.map((source) =>
      source.path === "components/Example.tsx" ? { ...source, status: "excluded" } : source,
    );
    registry.exceptions = [
      {
        anchor: "module",
        fingerprint: "1".repeat(64),
        kind: "jsx-text",
        path: "components/*",
        reason: "A fixture must never allow directory suppression.",
        text: "Save",
      },
    ];
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    await assert.rejects(
      checkUiI18nBoundaries({ registryPath, root }),
      /must name one exact source file/u,
    );
  });
});

test("keys exact exceptions by source path and fingerprint", async () => {
  await withInventoryFixture(async ({ registryPath, root }) => {
    const source = 'export const Shared = () => <button>Save settings</button>;\n';
    await writeRootFile(root, "components/Example.tsx", source);
    await writeRootFile(root, "components/Another.tsx", source);
    await writeUiI18nRegistry({ registryPath, root });

    const candidate = findUncatalogedUiStrings("components/Example.tsx", source)[0];
    const exactException = (path) => ({
      anchor: candidate.anchor,
      fingerprint: candidate.fingerprint,
      kind: candidate.kind,
      path,
      reason: "Fixture-only exact exception proves source-scoped membership.",
      text: candidate.text,
    });
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    registry.sources = registry.sources.map((entry) =>
      ["components/Another.tsx", "components/Example.tsx"].includes(entry.path)
        ? { ...entry, status: "excluded" }
        : entry,
    );
    registry.exceptions = [exactException("components/Example.tsx"), exactException("components/Another.tsx")];
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const accepted = await checkUiI18nBoundaries({ registryPath, root });
    assert.deepEqual(accepted.errors, []);

    registry.sources = registry.sources.map((entry) =>
      entry.path === "components/Another.tsx" ? { ...entry, status: "migrated" } : entry,
    );
    registry.exceptions = [exactException("components/Example.tsx")];
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const unreviewed = await checkUiI18nBoundaries({ registryPath, root });
    assert.match(unreviewed.errors.join("\n"), /components\/Another\.tsx:1 jsx-text/u);
  });
});

test("rejects duplicate exception records in the same source", async () => {
  await withInventoryFixture(async ({ registryPath, root }) => {
    const source = 'export const Shared = () => <button>Save settings</button>;\n';
    await writeRootFile(root, "components/Example.tsx", source);
    const candidate = findUncatalogedUiStrings("components/Example.tsx", source)[0];
    const exception = {
      anchor: candidate.anchor,
      fingerprint: candidate.fingerprint,
      kind: candidate.kind,
      path: "components/Example.tsx",
      reason: "Fixture-only exact exception proves duplicate rejection.",
      text: candidate.text,
    };
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    registry.sources = registry.sources.map((entry) =>
      entry.path === "components/Example.tsx" ? { ...entry, status: "excluded" } : entry,
    );
    registry.exceptions = [exception, { ...exception, reason: "The same source may not repeat an exception." }];
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    await assert.rejects(
      checkUiI18nBoundaries({ registryPath, root }),
      /Duplicate exception fingerprint for components\/Example\.tsx/u,
    );
  });
});

test("strict final completion rejects the honest pending inventory", async () => {
  await withInventoryFixture(async ({ registryPath, root }) => {
    const result = await checkUiI18nBoundaries({ complete: true, registryPath, root });
    assert.match(result.errors.join("\n"), /Strict final completion is blocked by \d+ pending source/u);
  });
});
