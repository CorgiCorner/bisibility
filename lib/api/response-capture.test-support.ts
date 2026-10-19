import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect } from "vitest";
import { getOpenApiDocument } from "./openapi";
import {
  captureFindingsChecker,
  contentTypeOnlyOperations,
  isJsonContentType,
  type ResponseCapture,
} from "./openapi-response-findings.test-support";
import { operationPolicyForRequest } from "./operation-policy";
import { bodyShape, scrubBody } from "./response-capture-normalize.test-support";
import type * as Router from "./router";

/**
 * Router-level response capture for the OpenAPI response conformance ratchet.
 *
 * A test file opts in by wrapping the real router:
 *
 *   vi.mock("./router", async (importOriginal) =>
 *     (await import("./response-capture.test-support")).captureRouter(await importOriginal()),
 *   );
 *
 * Every request the file sends through `handleApiRequest` (or the MCP preauthenticated entry)
 * is attributed to the OpenAPI operation whose method and path template match, and its status,
 * content type and JSON body are recorded. The captures of each file are committed under
 * `__fixtures__/response-captures/`, one per distinct body structure and conformance verdict.
 * A normal run fails when a response's structure or verdict is not in the committed file;
 * `BISIBILITY_RESPONSE_CAPTURE=write` rewrites it (see `npm run openapi:conformance:write`).
 */

export type { ResponseCapture };
export type ResponseCaptureFile = { captures: ResponseCapture[]; source: string };
export type CaptureOptions = {
  /**
   * Operations whose responses in this file come from a stub standing in for the response
   * builder or its record (for example a service mocked to `{ id: "ok_1" }`). Their bodies say
   * nothing about the real contract, so they are not recorded.
   */
  skip?: readonly string[];
};

type SpecOperation = { method: string; operationId: string; path: string; segments: string[] };
type RouteContext = { params?: Promise<{ path?: string[] }> | { path?: string[] } };
type FindingsChecker = ReturnType<typeof captureFindingsChecker>;

/** `BISIBILITY_RESPONSE_CAPTURE=write` rewrites the committed captures instead of checking them. */
export function isResponseCaptureWriteMode() {
  return process.env.BISIBILITY_RESPONSE_CAPTURE === "write";
}
export const responseCaptureDirectory = fileURLToPath(
  new URL("./__fixtures__/response-captures/", import.meta.url),
);
const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const httpMethods = ["delete", "get", "patch", "post", "put"] as const;

let specOperationCache: SpecOperation[] | undefined;

function specOperations(): SpecOperation[] {
  specOperationCache ??= Object.entries(getOpenApiDocument().paths).flatMap(([path, item]) =>
    httpMethods.flatMap((method) => {
      const operation = (item as Record<string, { operationId?: string } | undefined>)[method];
      if (!operation?.operationId) return [];
      const segments = path.split("/").filter(Boolean);
      return [{ method: method.toUpperCase(), operationId: operation.operationId, path, segments }];
    }),
  );
  return specOperationCache;
}

const isParameter = (segment: string) => segment.startsWith("{") && segment.endsWith("}");
const literalSegments = (operation: SpecOperation) =>
  operation.segments.filter((segment) => !isParameter(segment)).length;

/** The operation whose method and path template match, preferring the most literal template. */
export function matchSpecOperation(method: string, segments: readonly string[]) {
  return specOperations()
    .filter(
      (operation) =>
        operation.method === method.toUpperCase() &&
        operation.segments.length === segments.length &&
        operation.segments.every(
          (segment, index) => isParameter(segment) || segment === segments[index],
        ),
    )
    .sort((left, right) => literalSegments(right) - literalSegments(left))[0];
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const liveCaptures: ResponseCapture[] = [];
let sourcePath: string | undefined;

async function record(
  req: Request,
  segments: readonly string[],
  response: Response,
  skip: ReadonlySet<string>,
) {
  const method = req.method.toUpperCase();
  const operation = matchSpecOperation(method, segments);
  if (!operation || skip.has(operation.operationId)) return response;
  const policy = operationPolicyForRequest(method, segments);
  if (policy && policy.operationId !== operation.operationId) {
    throw new Error(
      `Router policy ${policy.operationId} and OpenAPI ${operation.operationId} disagree for ${method} /${segments.join("/")}`,
    );
  }
  const contentType = response.headers.get("content-type");
  const recordBody =
    isJsonContentType(contentType) && !contentTypeOnlyOperations.has(operation.operationId);
  sourcePath ??= expect.getState().testPath;
  liveCaptures.push({
    body: recordBody ? scrubBody(await readJsonBody(response.clone())) : null,
    contentType,
    method,
    operationId: operation.operationId,
    path: operation.path,
    status: response.status,
  });
  return response;
}

async function segmentsFrom(contextOrPath?: RouteContext | string[]) {
  if (Array.isArray(contextOrPath)) return contextOrPath;
  return (await contextOrPath?.params)?.path ?? [];
}

export function captureRouter(actual: typeof Router, options: CaptureOptions = {}): typeof Router {
  const skip = new Set(options.skip);
  return {
    ...actual,
    handleApiRequest: async (req, contextOrPath) => {
      const response = await actual.handleApiRequest(req, contextOrPath);
      return record(req, await segmentsFrom(contextOrPath), response, skip);
    },
    handleMcpPreauthenticatedApiRequest: async (req, path, preauthenticated) => {
      const response = await actual.handleMcpPreauthenticatedApiRequest(
        req,
        path,
        preauthenticated,
      );
      return record(req, path, response, skip);
    },
  };
}

const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

/** What the ratchet depends on: operation, status, content type, body structure and verdict. */
function signatureOf(capture: ResponseCapture, findingsOf: FindingsChecker) {
  const findings = findingsOf(capture)
    .map((finding) => `${finding.kind} ${finding.detail}`)
    .sort(compareText);
  return JSON.stringify([
    capture.operationId,
    capture.status,
    capture.contentType,
    bodyShape(capture.body),
    findings,
  ]);
}

/** One capture per distinct signature, in a stable order. */
function distinctCaptures(captures: readonly ResponseCapture[], findingsOf: FindingsChecker) {
  const ordered = [...captures].sort((left, right) =>
    compareText(JSON.stringify(left), JSON.stringify(right)),
  );
  const unique = new Map<string, ResponseCapture>();
  for (const capture of ordered) {
    const signature = signatureOf(capture, findingsOf);
    if (!unique.has(signature)) unique.set(signature, capture);
  }
  return [...unique.values()];
}

export function captureFileFor(source: string) {
  return join(responseCaptureDirectory, `${basename(source).replace(/\.test\.tsx?$/, "")}.json`);
}

function flushCaptures() {
  if (!sourcePath || liveCaptures.length === 0) return;
  const source = relative(repositoryRoot, sourcePath).split("\\").join("/");
  const file = captureFileFor(source);
  const findingsOf = captureFindingsChecker(getOpenApiDocument());
  if (isResponseCaptureWriteMode()) {
    mkdirSync(responseCaptureDirectory, { recursive: true });
    const captures = distinctCaptures(liveCaptures, findingsOf);
    const content: ResponseCaptureFile = { captures, source };
    writeFileSync(file, `${JSON.stringify(content, null, 2)}\n`);
    return;
  }
  const committed: ResponseCaptureFile = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : { captures: [], source };
  const recorded = new Set(committed.captures.map((capture) => signatureOf(capture, findingsOf)));
  const unrecorded = liveCaptures.filter(
    (capture) => !recorded.has(signatureOf(capture, findingsOf)),
  );
  expect(
    [...new Set(unrecorded.map((capture) => `${capture.operationId} ${capture.status}`))],
    `Responses of ${source} differ from ${relative(repositoryRoot, file)}. ` +
      "Regenerate the captures and the conformance list with `npm run openapi:conformance:write`.",
  ).toEqual([]);
}

afterAll(flushCaptures);
