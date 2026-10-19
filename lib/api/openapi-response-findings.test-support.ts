import {
  type ErrorObject,
  type ResponseValidator,
  responseValidatorFactory,
} from "./openapi-response-schemas.test-support";

/** Conformance findings for one captured router response against the OpenAPI document. */

export type ResponseCapture = {
  body: unknown;
  contentType: string | null;
  method: string;
  operationId: string;
  path: string;
  status: number;
};

export type ConformanceKind =
  | "composition-mismatch"
  | "content-type"
  | "missing-required"
  | "no-capture"
  | "no-success-capture"
  | "type-mismatch"
  | "undeclared-property"
  | "undeclared-status"
  | "value-mismatch";

export type Finding = { detail: string; kind: ConformanceKind };

type MediaObject = { schema?: unknown };
type ResponseObject = { content?: Record<string, MediaObject> };
type Operation = { operationId?: string; responses?: Record<string, ResponseObject> };
export type ConformanceDocument = {
  components: { schemas: Record<string, unknown> };
  paths: Record<string, Record<string, unknown>>;
};

/** Bodies that are not API resources (the OpenAPI document itself) are checked by type only. */
export const contentTypeOnlyOperations: ReadonlySet<string> = new Set(["getOpenApi"]);

export function isJsonContentType(contentType: string | null | undefined) {
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

const compositionKeywords = new Set(["anyOf", "oneOf"]);
const undeclaredKeywords = new Set([
  "additionalProperties",
  "false schema",
  "unevaluatedProperties",
]);
const valueKeywords = new Set([
  "const",
  "enum",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "multipleOf",
  "not",
  "pattern",
  "uniqueItems",
]);

const pointer = (path: string) => path.replace(/\/\d+(?=\/|$)/g, "/*") || "/";
const isUnder = (path: string, ancestor: string) =>
  path === ancestor || path.startsWith(`${ancestor}/`);
const joinPointer = (path: string, name: unknown) => `${path === "/" ? "" : path}/${String(name)}`;

function errorFinding(error: ErrorObject): Finding {
  const path = pointer(error.instancePath);
  if (error.keyword === "required") {
    return { detail: joinPointer(path, error.params.missingProperty), kind: "missing-required" };
  }
  if (error.keyword === "type") {
    return { detail: `${path} must be ${String(error.params.type)}`, kind: "type-mismatch" };
  }
  return {
    detail: `${path} ${error.keyword}`,
    kind: valueKeywords.has(error.keyword) ? "value-mismatch" : "composition-mismatch",
  };
}

/**
 * Structural errors from the open schema. Ajv reports every failed `anyOf`/`oneOf` branch; a
 * type error exactly at the composition comes from a branch the value never matched, so it is
 * dropped whenever another branch explains the failure more precisely.
 */
function structuralFindings(errors: readonly ErrorObject[]): Finding[] {
  const failedCompositions = errors.filter((error) => compositionKeywords.has(error.keyword));
  let kept = errors.filter(
    (error) => !compositionKeywords.has(error.keyword) && !undeclaredKeywords.has(error.keyword),
  );
  const findings: Finding[] = [];
  for (const composition of failedCompositions) {
    const at = composition.instancePath;
    const rootMismatch = (error: ErrorObject) =>
      error.instancePath === at && error.keyword === "type";
    const explained = kept.some((error) => isUnder(error.instancePath, at) && !rootMismatch(error));
    kept = kept.filter((error) => !rootMismatch(error));
    if (!explained) {
      findings.push({
        detail: `${pointer(at)} matches no ${composition.keyword} member`,
        kind: "composition-mismatch",
      });
    }
  }
  return [...findings, ...kept.map(errorFinding)];
}

/**
 * Undeclared properties from the closed schema. Below a failed composition no branch counts as
 * evaluated, so every property would look undeclared; those positions are left to the
 * structural findings.
 */
function undeclaredFindings(errors: readonly ErrorObject[], failedAt: readonly string[]) {
  return errors
    .filter(
      (error) =>
        undeclaredKeywords.has(error.keyword) &&
        !failedAt.some((path) => isUnder(error.instancePath, path)),
    )
    .map((error): Finding => {
      const name = error.params.unevaluatedProperty ?? error.params.additionalProperty;
      const path = pointer(error.instancePath);
      return {
        detail: name === undefined ? path : joinPointer(path, name),
        kind: "undeclared-property",
      };
    });
}

function schemaFindings(validator: ResponseValidator, body: unknown): Finding[] {
  const open = validator.open(body) ? [] : (validator.open.errors ?? []);
  const closed = validator.closed(body) ? [] : (validator.closed.errors ?? []);
  const failedAt = open
    .filter((error) => compositionKeywords.has(error.keyword))
    .map((error) => error.instancePath);
  return [...structuralFindings(open), ...undeclaredFindings(closed, failedAt)];
}

function responseFor(operation: Operation, status: number) {
  const responses = operation.responses ?? {};
  return responses[String(status)] ?? responses[`${String(status)[0]}XX`] ?? responses.default;
}

function findingsFor(
  capture: ResponseCapture,
  operation: Operation,
  validatorFor: (schema: unknown) => ResponseValidator,
): Finding[] {
  const response = responseFor(operation, capture.status);
  if (!response) return [{ detail: `status ${capture.status}`, kind: "undeclared-status" }];
  const content = response.content ?? {};
  const declared = Object.keys(content);
  const mediaType = capture.contentType?.split(";")[0]?.trim().toLowerCase() ?? null;
  if (mediaType === null) {
    return declared.length === 0 ? [] : [{ detail: "no content type", kind: "content-type" }];
  }
  const findings: Finding[] = content[mediaType]
    ? []
    : [{ detail: `${mediaType} not declared`, kind: "content-type" }];
  // A JSON body under an undeclared JSON media type is still checked against the declared one.
  const schema = isJsonContentType(mediaType)
    ? (content[mediaType] ?? content[declared.find(isJsonContentType) ?? ""])?.schema
    : undefined;
  if (schema === undefined || contentTypeOnlyOperations.has(capture.operationId)) return findings;
  return [...findings, ...schemaFindings(validatorFor(schema), capture.body)];
}

export function operationsById(document: ConformanceDocument) {
  const operations = new Map<string, Operation>();
  for (const item of Object.values(document.paths)) {
    for (const value of Object.values(item)) {
      const operation = value as Operation;
      if (operation?.operationId) operations.set(operation.operationId, operation);
    }
  }
  return operations;
}

/** A reusable checker: the findings of one capture, keyed by its operation. */
export function captureFindingsChecker(document: ConformanceDocument) {
  const operations = operationsById(document);
  const validatorFor = responseValidatorFactory(document);
  return (capture: ResponseCapture): Finding[] => {
    const operation = operations.get(capture.operationId);
    if (!operation) throw new Error(`Capture names unknown operation ${capture.operationId}`);
    return findingsFor(capture, operation, validatorFor);
  };
}
