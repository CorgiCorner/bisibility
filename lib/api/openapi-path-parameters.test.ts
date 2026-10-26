import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";
import { withDeclaredPathParameters } from "./openapi-path-parameters";

const methods = new Set(["get", "post", "put", "patch", "delete", "options", "head", "trace"]);
const required = (name: string) => ({
  in: "path",
  name,
  required: true,
  schema: { type: "string" },
});

describe("OpenAPI path parameters", () => {
  it("declares every URL placeholder, including operations without SDK annotations", () => {
    const document = getOpenApiDocument();
    let checked = 0;
    for (const [path, item] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(item)) {
        if (!methods.has(method)) continue;
        checked++;
        const names = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
        for (const name of names) {
          expect(
            (operation as { parameters?: object[] }).parameters,
            `${method.toUpperCase()} ${path}`,
          ).toEqual(
            expect.arrayContaining([expect.objectContaining({ in: "path", name, required: true })]),
          );
        }
      }
    }
    expect(checked).toBeGreaterThan(150);
  });

  it("preserves path-item metadata and lets operation parameters override path-level ones", () => {
    const input = {
      "/things/{thing}": {
        description: "A shared path",
        parameters: [{ ...required("thing"), schema: { type: "string", minLength: 1 } }],
        get: { parameters: [{ ...required("thing"), schema: { type: "string", minLength: 2 } }] },
      },
    };
    expect(withDeclaredPathParameters(input)).toEqual(input);
  });

  it("resolves shared parameter references without adding a duplicate", () => {
    const input = {
      "/things/{thing}": { parameters: [{ $ref: "#/components/parameters/Thing" }], get: {} },
    };
    expect(withDeclaredPathParameters(input, { Thing: required("thing") })).toEqual(input);
    expect(() => withDeclaredPathParameters(input)).toThrow(/parameter reference/i);
    expect(() =>
      withDeclaredPathParameters(input, {
        Thing: { $ref: "#/components/parameters/Other" },
        Other: { $ref: "#/components/parameters/Thing" },
      }),
    ).toThrow(/parameter reference/i);
  });

  it("rejects duplicate declarations and requires exactly one schema or content entry", () => {
    const apply = (parameters: object[]) =>
      withDeclaredPathParameters({
        "/things/{thing}": { get: { parameters } },
      });
    expect(() => apply([required("thing"), required("thing")])).toThrow(/duplicate/i);
    expect(() => apply([{ in: "path", name: "thing", required: true }])).toThrow(
      /schema or content/,
    );
    expect(() => apply([{ ...required("thing"), content: {} }])).toThrow(/schema or content/);
  });

  it("refuses unknown placeholders and invalid explicit path declarations", () => {
    expect(() => withDeclaredPathParameters({ "/things/{unknown_id}": { get: {} } })).toThrow(
      /unknown_id/,
    );
    expect(() =>
      withDeclaredPathParameters({
        "/things/{thing}": { get: { parameters: [{ ...required("thing"), required: false }] } },
      }),
    ).toThrow(/required/i);
    expect(() =>
      withDeclaredPathParameters({ "/things": { get: { parameters: [required("extra")] } } }),
    ).toThrow(/extra/);
  });

  it("uses route-specific token and monitor ID schemas", () => {
    const result = withDeclaredPathParameters({
      "/me/tokens/{token_id}": { delete: {} },
      "/migration-tokens/{token_id}": { delete: {} },
      "/projects/{project_id}/sitemap-monitors/{monitor_id}": { patch: {} },
    });
    expect(JSON.stringify(result["/me/tokens/{token_id}"])).toContain("^pat_");
    expect(JSON.stringify(result["/migration-tokens/{token_id}"])).toContain("^ferry_");
    expect(
      JSON.stringify(result["/projects/{project_id}/sitemap-monitors/{monitor_id}"]),
    ).toContain("^prj_");
  });
  it.each([
    ["/api-keys/{key_id}", "key_id", "key"],
    ["/competitors/{competitor_id}", "competitor_id", "cmp"],
    ["/team/invites/{invite_id}", "invite_id", "inv"],
    ["/projects/{project_id}/team/members/{member_id}", "member_id", "mbr"],
    ["/saved-views/{view_id}", "view_id", "viw"],
    ["/projects/{project_id}/webhooks/{webhook_id}", "webhook_id", "we"],
  ])("keeps the router's public-ID type for %s", (path, name, prefix) => {
    const result = withDeclaredPathParameters({ [path]: { delete: {} } }) as Record<
      string,
      { delete: { parameters: { name: string; schema: { pattern: string } }[] } }
    >;
    expect(
      result[path].delete.parameters.find((parameter) => parameter.name === name)?.schema.pattern,
    ).toBe(`^${prefix}_[a-z][a-z0-9]{23}$`);
  });
});
