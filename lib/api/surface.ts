import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { ZodError, type z } from "zod";
import { type ApiContext, forbidden, projectMatches } from "./context";
import { ApiConflictError, ApiInputError, ApiNotFoundError } from "./errors";

type PlainRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is PlainRecord {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function camelKey(key: string) {
  return key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

function snakeKey(key: string) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(camelizeKeys);
  }
  if (!isPlainRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [camelKey(key), camelizeKeys(item)]),
  );
}

export function snakeizeKeys(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(snakeizeKeys);
  }
  if (!isPlainRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [snakeKey(key), snakeizeKeys(item)]),
  );
}

export async function readJsonBody(ctx: Pick<ApiContext, "req">) {
  const raw = await ctx.req.text();
  return raw ? JSON.parse(raw) : {};
}

export function objectBody(value: unknown): PlainRecord {
  return isPlainRecord(value) ? value : {};
}

export function parseApiInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
): z.infer<TSchema> {
  return schema.parse(camelizeKeys(input));
}

export function scopedProject(ctx: ApiContext, projectId: string) {
  if (!projectMatches(ctx.auth, projectId)) {
    return forbidden(ctx, "API key is not scoped to this project.");
  }

  return null;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

export function domainError(error: unknown): never {
  if (error instanceof ZodError) {
    throw error;
  }
  if (error instanceof ProjectReadOnlyError) {
    throw error;
  }
  const detail = message(error);
  if (/not found/i.test(detail)) {
    throw new ApiNotFoundError(detail);
  }
  if (/already|duplicate|conflict/i.test(detail)) {
    throw new ApiConflictError(detail);
  }

  throw new ApiInputError(detail);
}

export async function runDomain<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    domainError(error);
  }
}
