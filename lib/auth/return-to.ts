import { SIGNED_IN_HOME_PATH } from "@/lib/auth/two-factor-routes";

export const RETURN_TO_REQUEST_HEADER = "x-bisibility-request-path";

const validationOrigin = "https://return-to.invalid";
const ANCHOR_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const ANCHOR_PARAM = "section";

function hasUnsafeCharacters(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (character === "\\" || code < 32 || code === 127) {
      return true;
    }
  }

  return false;
}

export function validateReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }

  if (hasUnsafeCharacters(value) || hasUnsafeCharacters(decoded) || decoded.startsWith("//")) {
    return null;
  }

  try {
    const target = new URL(value, validationOrigin);
    if (target.origin !== validationOrigin) {
      return null;
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

export function returnToOrDefault(value: unknown) {
  return validateReturnTo(value) ?? SIGNED_IN_HOME_PATH;
}

export function validateAnchor(value: unknown): string | null {
  return typeof value === "string" && ANCHOR_PATTERN.test(value) ? value : null;
}

function fragmentFreeDestination(value: unknown) {
  const target = new URL(returnToOrDefault(value), validationOrigin);
  const fragmentAnchor = validateAnchor(target.hash.slice(1));
  const queryAnchor = validateAnchor(target.searchParams.get(ANCHOR_PARAM));

  target.hash = "";
  target.searchParams.delete(ANCHOR_PARAM);

  return { anchor: fragmentAnchor ?? queryAnchor, target };
}

export function mergeReturnToHash(value: unknown, hash: string) {
  const { anchor: destinationAnchor, target } = fragmentFreeDestination(value);
  const hashAnchor = validateAnchor(hash.startsWith("#") ? hash.slice(1) : hash);
  const anchor = hashAnchor ?? destinationAnchor;

  if (anchor) {
    target.searchParams.set(ANCHOR_PARAM, anchor);
  }

  return `${target.pathname}${target.search}`;
}

export function loginErrorReturnTo(destination: unknown) {
  const target = mergeReturnToHash(destination, "");

  const login = new URL("/login", validationOrigin);
  login.searchParams.set("next", target);
  return `${login.pathname}${login.search}`;
}
