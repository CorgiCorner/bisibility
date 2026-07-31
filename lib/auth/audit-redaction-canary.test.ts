import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import ts from "typescript";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { type AuditClient, writeAudit } from "./audit";
import { hasDeclaredAuditAction } from "./audit-field-declarations";

vi.mock("server-only", () => ({}));

const root = resolve(import.meta.dirname, "../..");
const sourceRoots = [resolve(root, "app"), resolve(root, "components"), resolve(root, "lib")];
const publicProjectId = "prj_abcdefghijklmnopqrstuvwx";
const requestContext = {
  appVersion: "canary",
  correlationId: "redaction-canary",
  sourceIpHash: null,
  sourceIpMasked: null,
  userAgent: "vitest",
};

const writerModules = new Map([
  [
    "lib/auth/audit.ts",
    new Map([
      ["writeAudit", "writeAudit"],
      ["writeAuditFailure", "writeAuditFailure"],
    ]),
  ],
  ["lib/api/provider-audit.ts", new Map([["auditProviderMutation", "auditProviderMutation"]])],
]);

const localWriterWrappers = new Map([
  ["lib/actions/team.ts", new Set(["auditAndRevalidate"])],
  ["lib/api/provider-audit.ts", new Set(["auditProviderMutation"])],
  ["lib/api/rank-checks.ts", new Set(["writeFailureAudit"])],
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "generated" ? [] : sourceFiles(path);
    }
    if (![".ts", ".tsx"].includes(extname(entry.name)) || entry.name.includes(".test.")) return [];
    return [path];
  });
}

function normalize(node: ts.Node | undefined, source: ts.SourceFile) {
  return node?.getText(source).replace(/\s+/g, " ") ?? null;
}

function importedModulePath(importer: string, specifier: string) {
  const unresolved = specifier.startsWith("@/")
    ? resolve(root, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(root, importer, "..", specifier)
      : null;
  if (!unresolved) return null;
  for (const candidate of [
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    resolve(unresolved, "index.ts"),
    resolve(unresolved, "index.tsx"),
  ]) {
    if (existsSync(candidate)) return relative(root, candidate);
  }
  return null;
}

function enclosingFunctionName(node: ts.Node) {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current)) return current.name?.text ?? null;
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      ts.isVariableDeclaration(current.parent)
    ) {
      return ts.isIdentifier(current.parent.name) ? current.parent.name.text : null;
    }
    current = current.parent;
  }
  return null;
}

function property(input: ts.ObjectLiteralExpression, name: string, source: ts.SourceFile) {
  const match = input.properties.find((item) => {
    if (!ts.isPropertyAssignment(item) && !ts.isShorthandPropertyAssignment(item)) return false;
    return item.name.getText(source) === name;
  });
  if (match && ts.isShorthandPropertyAssignment(match)) return match.name.text;
  return match && ts.isPropertyAssignment(match) ? normalize(match.initializer, source) : null;
}

type AuditCallSite = {
  action: string | null;
  after: string | null;
  before: string | null;
  input: string | null;
  occurrence: number;
  path: string;
  statusReason: string | null;
  writer: string;
};

function auditCallSites(): AuditCallSite[] {
  const calls: Omit<AuditCallSite, "occurrence">[] = [];

  for (const absolutePath of sourceRoots.flatMap(sourceFiles)) {
    const path = relative(root, absolutePath);
    const text = readFileSync(absolutePath, "utf8");
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const writers = new Map<string, string>();

    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }
      const modulePath = importedModulePath(path, statement.moduleSpecifier.text);
      const exports = modulePath ? writerModules.get(modulePath) : null;
      const bindings = statement.importClause?.namedBindings;
      if (!exports || !bindings || !ts.isNamedImports(bindings)) continue;
      for (const element of bindings.elements) {
        const imported = (element.propertyName ?? element.name).text;
        const writer = exports.get(imported);
        if (writer) writers.set(element.name.text, writer);
      }
    }

    for (const wrapper of localWriterWrappers.get(path) ?? []) {
      writers.set(wrapper, wrapper);
    }

    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const writer = writers.get(node.expression.text);
        const wrapper = enclosingFunctionName(node);
        if (writer && !(wrapper && localWriterWrappers.get(path)?.has(wrapper))) {
          const input = node.arguments[0];
          const object = input && ts.isObjectLiteralExpression(input) ? input : null;
          calls.push({
            action: object ? property(object, "action", source) : null,
            after: object ? property(object, "after", source) : normalize(input, source),
            before: object ? property(object, "before", source) : null,
            input: normalize(input, source),
            path,
            statusReason: object ? property(object, "statusReason", source) : null,
            writer,
          });
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(source);
  }

  const occurrences = new Map<string, number>();
  return calls
    .sort((left, right) =>
      `${left.path}:${left.action}:${left.writer}`.localeCompare(
        `${right.path}:${right.action}:${right.writer}`,
      ),
    )
    .map((call) => {
      const key = `${call.path}:${call.action}:${call.writer}`;
      const occurrence = (occurrences.get(key) ?? 0) + 1;
      occurrences.set(key, occurrence);
      return { ...call, occurrence };
    });
}

let discoveredAuditCallSites: AuditCallSite[];

beforeAll(() => {
  discoveredAuditCallSites = auditCallSites();
}, 30_000);

function auditClient() {
  const create = vi.fn().mockResolvedValue({ id: "audit_1" });
  return {
    client: { auditLog: { create } },
    data: () => create.mock.calls.at(-1)?.[0].data,
  };
}

async function writeCanary(after: unknown, statusReason?: string, action = "redaction.canary") {
  const { client, data } = auditClient();
  await writeAudit(
    {
      action,
      actorId: null,
      after,
      requestContext,
      statusReason,
      targetId: publicProjectId,
      targetType: "project",
    },
    client as unknown as AuditClient,
  );
  return data();
}

describe("audit redaction canaries", () => {
  it("enumerates every application audit payload producer and shape", () => {
    expect(discoveredAuditCallSites).toMatchSnapshot();
  });

  it("requires every literal producer action to declare its payload fields", () => {
    const undeclared = discoveredAuditCallSites.flatMap((call) => {
      if (!call.action?.startsWith('"')) return [];
      const action = JSON.parse(call.action) as string;
      return hasDeclaredAuditAction(action) ? [] : [`${call.path}: ${action}`];
    });
    expect(undeclared).toEqual([]);
  });

  it("drops undeclared sensitive keys at any depth", async () => {
    const secret = "audit-canary-secret-redaction-0001";
    const data = await writeCanary({
      apiKey: secret,
      api_key: secret,
      authorization: secret,
      credentialsEncrypted: secret,
      hashedKey: secret,
      hashed_key: secret,
      nested: [{ code: secret, otp: secret, password: secret, secret, token: secret }],
    });
    expect(JSON.stringify(data)).not.toContain(secret);
    expect(data.after).toBeUndefined();
  });

  it.each([
    [
      "provider connection credential flags",
      "provider.connect",
      { hasCredentials: "audit-canary-secret" },
    ],
    [
      "rank-check provider failure codes",
      "rank_check.failed",
      { code: "audit-canary-secret", keywordId: "kw_abcdefghijklmnopqrstuvwx" },
    ],
  ])("redacts secrets planted in the real %s payload shape", async (_name, action, payload) => {
    const data = await writeCanary(payload, undefined, action);
    expect(JSON.stringify(data)).not.toContain("audit-canary-secret");
  });

  it("fails closed for an undeclared neutral field carrying credentials", async () => {
    const secret = "audit-canary-secret-unmatched-0001";
    // Keep the sanctioned fixture literal: the publication scan exempts it exactly.
    const target = "https://user:pass@example.com/hook";
    const data = await writeCanary({ bearer: secret, target });
    expect(data.after).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain(secret);
    expect(JSON.stringify(data)).not.toContain("user:pass");
  });

  it("removes credential-bearing URL components from a declared webhook field", async () => {
    const data = await writeCanary(
      {
        description: "deploy hook",
        enabled: true,
        publicId: "we_abcdefghijklmnopqrstuvwx",
        url: "https://user:pass@example.com/hook?access_token=secret",
      },
      undefined,
      "webhook_endpoint.create",
    );
    expect(data.after).toEqual({
      description: "deploy hook",
      enabled: true,
      publicId: "we_abcdefghijklmnopqrstuvwx",
      url: "https://example.com/hook",
    });
    expect(JSON.stringify(data)).not.toContain("user:pass");
    expect(JSON.stringify(data)).not.toContain("access_token");
  });

  it("keeps a declared field that an audit reader needs", async () => {
    const data = await writeCanary(
      {
        keywordId: "kw_abcdefghijklmnopqrstuvwx",
        text: "rank tracker",
      },
      undefined,
      "keyword.add",
    );
    expect(data.after).toEqual({
      keywordId: "kw_abcdefghijklmnopqrstuvwx",
      text: "rank tracker",
    });
  });

  it("redacts a secret-shaped status reason independently of payload keys", async () => {
    const secret = "audit-canary-secret-status-0001";
    const data = await writeCanary({ result: "failed" }, `Bearer ${secret}`);

    expect(data.statusReason).toBe("[redacted]");
    expect(JSON.stringify(data)).not.toContain(secret);
  });
});
