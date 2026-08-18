import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";

type Operation = {
  parameters?: Array<{ $ref?: string }>;
  security?: Array<Record<string, unknown>>;
};

const PROJECT_SELECTION_EXEMPT = /^\/(me(\/|$)|projects$|locations\/search$)|\{project_?[iI]d\}/;

function acceptsPersonalAccessToken(operation: Operation) {
  return (
    Array.isArray(operation.security) &&
    operation.security.some(
      (requirement) =>
        requirement && typeof requirement === "object" && "PersonalAccessToken" in requirement,
    )
  );
}

function selectionRefs(operation: Operation) {
  return ((operation.parameters ?? []) as Array<{ $ref?: string }>)
    .map((parameter) => parameter.$ref)
    .filter((ref) => ref?.startsWith("#/components/parameters/Project"));
}

describe("OpenAPI project-selection parameter contract", () => {
  const document = getOpenApiDocument();

  it("declares both reusable project-selection components as optional", () => {
    expect(document.components.parameters.ProjectHeader).toMatchObject({
      in: "header",
      name: "X-Bisibility-Project",
      required: false,
    });
    expect(document.components.parameters.ProjectQuery).toMatchObject({
      in: "query",
      name: "project",
      required: false,
    });
  });

  it("attaches exactly one of each selector to every PAT-accepting, project-resolving operation", () => {
    const expectedRef = "#/components/parameters/Project";
    const expectedHeader = `${expectedRef}Header`;
    const expectedQuery = `${expectedRef}Query`;
    const violations: string[] = [];

    for (const [path, methods] of Object.entries(document.paths)) {
      const exempt = PROJECT_SELECTION_EXEMPT.test(path);
      for (const [method, operation] of Object.entries(methods as Record<string, Operation>)) {
        const refs = selectionRefs(operation);
        if (exempt || !acceptsPersonalAccessToken(operation)) {
          if (refs.length > 0) {
            violations.push(
              `${method.toUpperCase()} ${path} must not carry project selectors but has ${refs.join(", ")}.`,
            );
          }
          continue;
        }
        const headerCount = refs.filter((ref) => ref === expectedHeader).length;
        const queryCount = refs.filter((ref) => ref === expectedQuery).length;
        if (headerCount !== 1 || queryCount !== 1) {
          violations.push(
            `${method.toUpperCase()} ${path} must have exactly one of each selector but has header=${headerCount}, query=${queryCount}.`,
          );
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("does not attach selectors to any exempt or non-PAT operation", () => {
    const violations: string[] = [];

    for (const [path, methods] of Object.entries(document.paths)) {
      const exempt = PROJECT_SELECTION_EXEMPT.test(path);
      for (const [method, operation] of Object.entries(methods as Record<string, Operation>)) {
        const refs = selectionRefs(operation);
        if (exempt || !acceptsPersonalAccessToken(operation)) {
          if (refs.length > 0) {
            violations.push(
              `${method.toUpperCase()} ${path} is exempt/non-PAT but carries ${refs.join(", ")}.`,
            );
          }
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
