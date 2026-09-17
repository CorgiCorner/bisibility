import { type MessageFormatElement, parse, TYPE } from "@formatjs/icu-messageformat-parser";

export type MessageCatalog = { readonly [key: string]: MessageCatalog | string };

type MutableMessageCatalog = Record<string, MessageCatalog | string>;

type UnionToIntersection<Value> = (Value extends unknown ? (value: Value) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;

/** The precise shape available after composing statically selected fragments. */
export type MergedMessageCatalog<Fragments extends readonly MessageCatalog[]> = [
  Fragments[number],
] extends [never]
  ? Record<never, never>
  : UnionToIntersection<Fragments[number]>;

const reservedCatalogKeys = new Set(["__proto__", "constructor", "prototype"]);

function catalogPath(prefix: string, key: string) {
  return prefix ? `${prefix}.${key}` : key;
}

function isPlainObject(value: unknown): value is MutableMessageCatalog {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertCatalogNode(value: unknown, path: string, ancestors: Set<object>): void {
  if (typeof value === "string") {
    if (!value.trim()) throw new Error(`Empty message at ${path}.`);
    return;
  }

  if (!isPlainObject(value)) {
    throw new Error(
      `Malformed catalog node at ${path}: expected a message string or plain object.`,
    );
  }
  if (ancestors.has(value)) throw new Error(`Malformed cyclic catalog at ${path}.`);

  const entries = Object.entries(value);
  if (entries.length === 0) throw new Error(`Empty catalog namespace at ${path}.`);

  ancestors.add(value);
  for (const [key, child] of entries) {
    if (!key || key.includes(".") || reservedCatalogKeys.has(key)) {
      throw new Error(`Malformed catalog key at ${catalogPath(path, key)}.`);
    }
    assertCatalogNode(child, catalogPath(path, key), ancestors);
  }
  ancestors.delete(value);
}

/** Rejects data that cannot be safely merged, flattened or sent to next-intl. */
export function assertMessageCatalog(catalog: unknown): asserts catalog is MessageCatalog {
  assertCatalogNode(catalog, "catalog", new Set());
}

function cloneCatalog(value: MessageCatalog | string): MessageCatalog | string {
  if (typeof value === "string") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneCatalog(child)]),
  );
}

function mergeInto(target: MutableMessageCatalog, source: MessageCatalog, prefix = "") {
  for (const [key, value] of Object.entries(source)) {
    const path = catalogPath(prefix, key);
    if (!Object.hasOwn(target, key)) {
      target[key] = cloneCatalog(value);
      continue;
    }

    const existing = target[key];
    if (existing === undefined) throw new Error(`Missing catalog node at ${path}.`);
    if (typeof existing === "string" && typeof value === "string") {
      throw new Error(`Duplicate message leaf at ${path}.`);
    }
    if (typeof existing === "string" || typeof value === "string") {
      throw new Error(`Catalog shape conflict at ${path}.`);
    }
    if (!isPlainObject(existing)) throw new Error(`Malformed catalog node at ${path}.`);

    mergeInto(existing, value, path);
  }
}

/**
 * Composes explicitly imported fragments without allowing one namespace to
 * overwrite another. The returned intersection retains generated literal keys.
 */
export function mergeMessageCatalogs<const Fragments extends readonly MessageCatalog[]>(
  ...fragments: Fragments
): MergedMessageCatalog<Fragments> {
  const merged: MutableMessageCatalog = {};
  for (const fragment of fragments) {
    assertMessageCatalog(fragment);
    mergeInto(merged, fragment);
  }
  return merged as MergedMessageCatalog<Fragments>;
}

type MessageSignature = {
  arguments: Map<string, TYPE>;
  exactPluralOptions: Map<string, Set<string>>;
  pluralRules: Map<string, { offset: number; type: Intl.PluralRulesOptions["type"] }>;
  selectOptions: Map<string, Set<string>>;
  tags: Set<string>;
};

function flattenCatalog(catalog: MessageCatalog, prefix = "", result = new Map<string, string>()) {
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      result.set(path, value);
    } else {
      flattenCatalog(value, path, result);
    }
  }
  return result;
}

function collectSignature(elements: MessageFormatElement[], signature: MessageSignature) {
  for (const element of elements) {
    if (element.type === TYPE.tag) {
      signature.tags.add(element.value);
      collectSignature(element.children, signature);
      continue;
    }

    if (element.type === TYPE.plural || element.type === TYPE.select) {
      const optionNames = Object.keys(element.options);
      if (element.type === TYPE.plural && !element.options.other) {
        throw new Error(`Plural argument ${element.value} requires an other branch.`);
      }
      signature.arguments.set(element.value, element.type);
      if (element.type === TYPE.select) {
        signature.selectOptions.set(element.value, new Set(optionNames));
      } else {
        signature.pluralRules.set(element.value, {
          offset: element.offset,
          type: element.pluralType,
        });
        signature.exactPluralOptions.set(
          element.value,
          new Set(optionNames.filter((option) => option.startsWith("="))),
        );
      }
      for (const option of Object.values(element.options)) {
        collectSignature(option.value, signature);
      }
      continue;
    }

    if (
      element.type === TYPE.argument ||
      element.type === TYPE.date ||
      element.type === TYPE.number ||
      element.type === TYPE.time
    ) {
      signature.arguments.set(element.value, element.type);
    }
  }
}

export function messageSignature(message: string): MessageSignature {
  const signature: MessageSignature = {
    arguments: new Map(),
    exactPluralOptions: new Map(),
    pluralRules: new Map(),
    selectOptions: new Map(),
    tags: new Set(),
  };
  collectSignature(parse(message), signature);
  return signature;
}

function sameSet<T>(left: Set<T>, right: Set<T>) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function sameArguments(left: Map<string, TYPE>, right: Map<string, TYPE>) {
  return left.size === right.size && [...left].every(([name, type]) => right.get(name) === type);
}

function sameOptionMaps(left: Map<string, Set<string>>, right: Map<string, Set<string>>) {
  return (
    left.size === right.size &&
    [...left].every(([name, options]) => {
      const candidateOptions = right.get(name);
      return candidateOptions !== undefined && sameSet(options, candidateOptions);
    })
  );
}

function samePluralRules(
  left: MessageSignature["pluralRules"],
  right: MessageSignature["pluralRules"],
) {
  return (
    left.size === right.size &&
    [...left].every(([name, rule]) => {
      const candidateRule = right.get(name);
      return (
        candidateRule !== undefined &&
        candidateRule.offset === rule.offset &&
        candidateRule.type === rule.type
      );
    })
  );
}

/**
 * Compares catalog shape, not translated wording. ICU plural branches are
 * intentionally not compared because each locale has its own CLDR categories.
 */
export function validateCatalogParity(
  reference: MessageCatalog,
  candidate: MessageCatalog,
): string[] {
  try {
    assertMessageCatalog(reference);
    assertMessageCatalog(candidate);
  } catch (error) {
    return [
      `catalog: malformed (${error instanceof Error ? error.message : "unknown validation error"})`,
    ];
  }

  const issues: string[] = [];
  const expected = flattenCatalog(reference);
  const received = flattenCatalog(candidate);

  for (const key of expected.keys()) {
    if (!received.has(key)) issues.push(`${key}: missing message`);
  }
  for (const key of received.keys()) {
    if (!expected.has(key)) issues.push(`${key}: unexpected message`);
  }

  for (const [key, message] of expected) {
    const translation = received.get(key);
    if (!translation?.trim()) {
      issues.push(`${key}: empty message`);
      continue;
    }

    try {
      const expectedSignature = messageSignature(message);
      const receivedSignature = messageSignature(translation);
      if (!sameArguments(expectedSignature.arguments, receivedSignature.arguments)) {
        issues.push(`${key}: ICU argument signature differs`);
      }
      if (!sameSet(expectedSignature.tags, receivedSignature.tags)) {
        issues.push(`${key}: rich-text tag signature differs`);
      }
      if (!sameOptionMaps(expectedSignature.selectOptions, receivedSignature.selectOptions)) {
        issues.push(`${key}: select option identifiers differ`);
      }
      if (
        !sameOptionMaps(expectedSignature.exactPluralOptions, receivedSignature.exactPluralOptions)
      ) {
        issues.push(`${key}: exact plural option identifiers differ`);
      }
      if (!samePluralRules(expectedSignature.pluralRules, receivedSignature.pluralRules)) {
        issues.push(`${key}: plural mode or offset differs`);
      }
    } catch (error) {
      issues.push(
        `${key}: invalid ICU message (${error instanceof Error ? error.message : "unknown"})`,
      );
    }
  }

  return issues;
}

export function flattenMessageCatalog(catalog: MessageCatalog) {
  assertMessageCatalog(catalog);
  return Object.fromEntries(flattenCatalog(catalog));
}
