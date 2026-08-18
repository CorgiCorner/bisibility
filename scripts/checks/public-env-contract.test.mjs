import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, after, before } from "node:test";
import { parseStarterNames, parseDocsNames, registryPathFromArgs, validateContract } from "./public-env-contract.mjs";
import { envClassification, primaryCategories, classifiedAllowlist, deploymentInputKeys } from "./public-env-classification.mjs";
import { scanRuntimeEnvNames } from "./public-env-scanner.mjs";

const baseRuntime = new Set(["DATABASE_URL", "REDIS_URL", "SITE_URL", "NODE_ENV"]);
const baseStarter = parseStarterNames("DATABASE_URL=\nREDIS_URL=\nSITE_URL=\n");
const baseDocs = parseDocsNames(
  "| `DATABASE_URL` | Yes | Runtime PostgreSQL connection. |\n| `REDIS_URL` | Yes | Redis URL. |\n| `SITE_URL` | Yes | App URL. |\n| `BISIBILITY_PROVIDER_RATE_LIMIT_*` | No | Provider limits. |\n| `ALERT_*` | No | Alert tuning. |\n",
);

function hasErrorMatching(errors, substring) {
  return errors.some((e) => e.includes(substring));
}

function makeTmpRoot() {
  const tmp = mkdtempSync(path.join(tmpdir(), "env-contract-test-"));
  for (const d of ["app", "lib", "components"]) mkdirSync(path.join(tmp, d), { recursive: true });
  for (const f of ["middleware.ts", "instrumentation.ts", "instrumentation-client.ts", "next.config.ts", "sentry.edge.config.ts", "sentry.server.config.ts"]) {
    writeFileSync(path.join(tmp, f), "");
  }
  return tmp;
}

describe("docs-only variables are allowed", () => {
  it("accepts a runtime variable that is in specific docs but not in the starter", () => {
    const docs = { specific: new Set([...baseDocs.specific, "LEGAL_TERMS_URL"]), wildcards: baseDocs.wildcards };
    const runtime = new Set([...baseRuntime, "LEGAL_TERMS_URL"]);
    const errors = validateContract({ runtimeNames: runtime, starterNames: baseStarter, registryNames: baseStarter, docsNames: docs });
    assert.equal(errors.length, 0);
  });
});

describe("registry path argument", () => {
  it("accepts omission or an existing relative path and rejects unsafe injection", () => {
    assert.equal(registryPathFromArgs([]), null);
    assert.equal(registryPathFromArgs(["--registry", "package.json"]), "package.json");
    for (const args of [["--registry"], ["--registry", path.resolve("package.json")], ["--registry", "../outside"], ["--registry", "missing-registry.mjs"]]) assert.throws(() => registryPathFromArgs(args));
  });
});

describe("undocumented registry entry fails", () => {
  it("fails when a registry variable is not in docs", () => {
    const registry = new Set([...baseStarter, "NEW_REGISTRY_VAR"]);
    const errors = validateContract({ runtimeNames: baseRuntime, starterNames: new Set([...baseStarter, "NEW_REGISTRY_VAR"]), registryNames: registry, docsNames: baseDocs });
    assert.ok(hasErrorMatching(errors, "NEW_REGISTRY_VAR") && hasErrorMatching(errors, "configuration.mdx"));
  });
});

describe("unclassified public runtime variable fails", () => {
  it("fails when a runtime variable is not in registry, specific docs, or allowlist", () => {
    const runtime = new Set([...baseRuntime, "UNKNOWN_RUNTIME_VAR"]);
    const errors = validateContract({ runtimeNames: runtime, starterNames: baseStarter, registryNames: baseStarter, docsNames: baseDocs });
    assert.ok(hasErrorMatching(errors, "UNKNOWN_RUNTIME_VAR"));
  });
});

describe("wildcard safety", () => {
  it("wildcard docs alone does not classify a runtime variable", () => {
    const docs = { specific: baseDocs.specific, wildcards: new Set(["WILDCARD_*"]) };
    const runtime = new Set([...baseRuntime, "WILDCARD_FOO"]);
    const errors = validateContract({ runtimeNames: runtime, starterNames: baseStarter, registryNames: baseStarter, docsNames: docs });
    assert.ok(hasErrorMatching(errors, "WILDCARD_FOO"));
  });

  it("wildcard docs covers registry variables", () => {
    const docs = {
      specific: baseDocs.specific,
      wildcards: new Set([...baseDocs.wildcards, "DATABASE_*"]),
    };
    const registry = new Set([...baseStarter, "DATABASE_EXTRA"]);
    const errors = validateContract({ runtimeNames: baseRuntime, starterNames: registry, registryNames: registry, docsNames: docs });
    assert.equal(errors.length, 0);
  });
});

describe("public starter subset enforcement", () => {
  it("fails when starter has a variable not in the registry", () => {
    const starter = new Set([...baseStarter, "EXTRA_STARTER_VAR"]);
    const docs = { specific: new Set([...baseDocs.specific, "EXTRA_STARTER_VAR"]), wildcards: baseDocs.wildcards };
    const errors = validateContract({ runtimeNames: baseRuntime, starterNames: starter, registryNames: baseStarter, docsNames: docs });
    assert.ok(hasErrorMatching(errors, "EXTRA_STARTER_VAR") && hasErrorMatching(errors, "public registry"));
  });
});

describe("primary category pairwise disjointness", () => {
  it("fails when a name appears in two primary categories", () => {
    const orig = envClassification.framework;
    envClassification.framework = [...orig, "OVERLAP_VAR"];
    envClassification.test = [...envClassification.test, "OVERLAP_VAR"];
    const errors = validateContract({ runtimeNames: baseRuntime, starterNames: baseStarter, registryNames: baseStarter, docsNames: baseDocs });
    envClassification.framework = orig;
    envClassification.test = envClassification.test.filter((n) => n !== "OVERLAP_VAR");
    assert.ok(hasErrorMatching(errors, "overlap") && hasErrorMatching(errors, "OVERLAP_VAR"));
  });
});

describe("registry/classification disjointness", () => {
  it("fails when a registry variable appears in a primary classification", () => {
    const cat = primaryCategories[0];
    const orig = envClassification[cat];
    const collideVar = "COLLIDE_VAR";
    envClassification[cat] = [...orig, collideVar];
    const registry = new Set([...baseStarter, collideVar]);
    const docs = { specific: new Set([...baseDocs.specific, collideVar]), wildcards: baseDocs.wildcards };
    const errors = validateContract({ runtimeNames: baseRuntime, starterNames: registry, registryNames: registry, docsNames: docs });
    envClassification[cat] = orig;
    assert.ok(hasErrorMatching(errors, collideVar) && hasErrorMatching(errors, "classification"));
  });
});

describe("public documentation classification", () => {
  it("rejects hosted-only variables in the public reference", () => {
    const hostedName = envClassification.hostedOnly[0];
    const docs = {
      specific: new Set([...baseDocs.specific, hostedName]),
      wildcards: baseDocs.wildcards,
    };
    const errors = validateContract({
      runtimeNames: baseRuntime,
      starterNames: baseStarter,
      registryNames: baseStarter,
      docsNames: docs,
    });
    assert.ok(hasErrorMatching(errors, `Hosted-only variable ${hostedName}`));
  });

  it("requires docs-only variables to be covered", () => {
    const previous = envClassification.docsOnly;
    envClassification.docsOnly = ["MISSING_DOCS_ONLY_VAR"];
    const errors = validateContract({
      runtimeNames: baseRuntime,
      starterNames: baseStarter,
      registryNames: baseStarter,
      docsNames: baseDocs,
    });
    envClassification.docsOnly = previous;
    assert.ok(hasErrorMatching(errors, "MISSING_DOCS_ONLY_VAR"));
  });
});

describe("deploymentInput excluded from classifiedAllowlist", () => {
  it("classifiedAllowlist does not include deploymentInput-only keys", () => {
    const allow = classifiedAllowlist();
    const primaryNames = new Set(primaryCategories.flatMap((c) => envClassification[c]));
    for (const key of deploymentInputKeys()) {
      if (!primaryNames.has(key)) {
        assert.equal(allow.has(key), false, `deploymentInput key ${key} should not be in classifiedAllowlist`);
      }
    }
  });
});

describe("parseDocsNames first-column-only", () => {
  it("extracts names only from the first column, not descriptions", () => {
    const src = "| `DOCUMENTED_VAR` | Description mentions `INCIDENTAL_VAR`. |\n| `SECOND_VAR` | More text. |\n";
    const docs = parseDocsNames(src);
    assert.ok(docs.specific.has("DOCUMENTED_VAR"));
    assert.ok(docs.specific.has("SECOND_VAR"));
    assert.equal(docs.specific.has("INCIDENTAL_VAR"), false);
  });

  it("separates wildcards from specific names", () => {
    const src = "| `SPECIFIC_VAR` | desc |\n| `WILDCARD_*` | desc |\n";
    const docs = parseDocsNames(src);
    assert.ok(docs.specific.has("SPECIFIC_VAR"));
    assert.ok(docs.wildcards.has("WILDCARD_*"));
    assert.equal(docs.specific.has("WILDCARD_*"), false);
  });
});

describe("scanner AST features", () => {
  const tmpRoot = mkdtempSync(path.join(tmpdir(), "env-scanner-ast-"));
  before(() => {
    for (const d of ["app", "lib", "components"]) mkdirSync(path.join(tmpRoot, d), { recursive: true });
    for (const f of ["middleware.ts", "instrumentation.ts", "instrumentation-client.ts", "next.config.ts", "sentry.edge.config.ts", "sentry.server.config.ts"]) {
      writeFileSync(path.join(tmpRoot, f), "");
    }
  });
  after(() => rmSync(tmpRoot, { recursive: true, force: true }));

  it("detects dot access, bracket string, and no-substitution template", () => {
    writeFileSync(path.join(tmpRoot, "lib", "access.ts"),
      'const a = process.env.DOT_VAR;\nconst b = process.env["BRACKET_VAR"];\nconst c = process.env[`TEMPLATE_VAR`];\n');
    const names = new Set(scanRuntimeEnvNames(tmpRoot));
    assert.ok(names.has("DOT_VAR"));
    assert.ok(names.has("BRACKET_VAR"));
    assert.ok(names.has("TEMPLATE_VAR"));
  });

  it("detects destructuring from process.env", () => {
    writeFileSync(path.join(tmpRoot, "lib", "destruct.ts"),
      'const { DESTRUCT_A, DESTRUCT_B } = process.env;\n');
    const names = new Set(scanRuntimeEnvNames(tmpRoot));
    assert.ok(names.has("DESTRUCT_A"));
    assert.ok(names.has("DESTRUCT_B"));
  });

  it("detects renamed destructuring from process.env", () => {
    writeFileSync(path.join(tmpRoot, "lib", "renamed.ts"),
      "const { RENAMED_ENV_VAR: localName } = process.env;\n");
    const names = new Set(scanRuntimeEnvNames(tmpRoot));
    assert.ok(names.has("RENAMED_ENV_VAR"));
    assert.equal(names.has("localName"), false);
  });

  it("detects environment reads inside TSX", () => {
    writeFileSync(path.join(tmpRoot, "components", "env-view.tsx"),
      "export const view = <div>{process.env.TSX_ENV_VAR}</div>;\n");
    const names = new Set(scanRuntimeEnvNames(tmpRoot));
    assert.ok(names.has("TSX_ENV_VAR"));
  });

  it("rejects rest destructuring", () => {
    const isolated = makeTmpRoot();
    writeFileSync(path.join(isolated, "lib", "rest.ts"),
      "const { SAFE_VAR, ...rest } = process.env;\n");
    try {
      assert.throws(() => scanRuntimeEnvNames(isolated), /rest\.ts:1: unresolved process\.env rest destructuring/);
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });

  it("tracks static access through an environment alias", () => {
    writeFileSync(path.join(tmpRoot, "lib", "alias.ts"),
      "const env = process.env;\nconst value = env.ALIAS_ENV_VAR;\n");
    const names = new Set(scanRuntimeEnvNames(tmpRoot));
    assert.ok(names.has("ALIAS_ENV_VAR"));
  });

  it("rejects computed access through an environment alias", () => {
    const isolated = makeTmpRoot();
    writeFileSync(path.join(isolated, "lib", "alias-dynamic.ts"),
      "const env = process.env;\nconst value = env[name];\n");
    try {
      assert.throws(() => scanRuntimeEnvNames(isolated), /alias-dynamic\.ts:2/);
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });

  it("rejects syntax errors instead of scanning a broken tree", () => {
    const isolated = makeTmpRoot();
    writeFileSync(path.join(isolated, "components", "broken.tsx"),
      "export const view = <div>{process.env.BROKEN_ENV_VAR}</span>;\n");
    try {
      assert.throws(() => scanRuntimeEnvNames(isolated), /broken\.tsx:1: TypeScript parse error/);
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });

  it("comments do not create matches", () => {
    writeFileSync(path.join(tmpRoot, "lib", "comment.ts"),
      '// process.env.COMMENT_VAR\n/* process.env.BLOCK_COMMENT_VAR */\nconst x = 1;\n');
    const names = new Set(scanRuntimeEnvNames(tmpRoot));
    assert.equal(names.has("COMMENT_VAR"), false);
    assert.equal(names.has("BLOCK_COMMENT_VAR"), false);
  });

  it("unresolved computed access fails with file:line", () => {
    const isolated = makeTmpRoot();
    writeFileSync(path.join(isolated, "lib", "computed.ts"),
      'const name = "DYNAMIC";\nconst x = process.env[name];\n');
    try {
      assert.throws(() => scanRuntimeEnvNames(isolated), /computed\.ts:2/);
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });

  it("a declaration comment cannot bypass unresolved computed access", () => {
    const isolated = makeTmpRoot();
    writeFileSync(path.join(isolated, "lib", "declared.ts"),
      '// @env-declare DECLARED_ONE DECLARED_TWO\nconst x = process.env[someName];\n');
    try {
      assert.throws(() => scanRuntimeEnvNames(isolated), /declared\.ts:2/);
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });

  it("missing scan root fails", () => {
    const badRoot = mkdtempSync(path.join(tmpdir(), "env-scanner-missing-"));
    try {
      assert.throws(() => scanRuntimeEnvNames(badRoot), /not found/);
    } finally {
      rmSync(badRoot, { recursive: true, force: true });
    }
  });
});
