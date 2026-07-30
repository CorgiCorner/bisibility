// No-op stubs for Next.js request/runtime modules.
//
// The Temporal worker imports the app lib graph (lib/auth, lib/actions, ...),
// which transitively pulls in next/headers, next/cache, next/navigation, etc.
// Those APIs only work inside a Next server request and Next 15 gates some of
// them behind a server export condition the plain-node worker can't match.
// The worker's activities never call them, so lib/temporal/loader.mjs resolves
// these specifiers to this module - keeping the worker self-contained and
// independent of the `next` package at runtime. (Single module exporting the
// union of names so any of the stubbed specifiers can import from it.)

// next/headers
export const cookies = () => ({
  get: () => undefined,
  getAll: () => [],
  has: () => false,
  set: () => {},
  delete: () => {},
});
export const headers = () => new Headers();
export const draftMode = () => ({ isEnabled: false, enable: () => {}, disable: () => {} });

// next/cache
export const revalidatePath = () => {};
export const revalidateTag = () => {};
export const unstable_cache = (fn) => fn;
export const unstable_noStore = () => {};

// next/navigation
const unavailable = (name) => () => {
  throw new Error(`next/navigation ${name}() is not available in the Temporal worker`);
};
export const redirect = unavailable("redirect");
export const permanentRedirect = unavailable("permanentRedirect");
export const notFound = unavailable("notFound");
export const RedirectType = Object.freeze({ push: "push", replace: "replace" });

// next/server
export const connection = async () => {};
// biome-ignore lint/complexity/noStaticOnlyClass: mirrors NextResponse's static helper shape.
export class NextResponse {
  static json() {
    return {};
  }
  static redirect() {
    return {};
  }
  static next() {
    return {};
  }
}
export class NextRequest {
  url = "";
}
export const userAgent = () => ({});

// next/link (default export)
export default function Link() {
  return null;
}
