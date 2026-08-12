import { beforeEach, vi } from "vitest";

type NavigationState = {
  pathname: string;
  searchParams: URLSearchParams;
  params: Record<string, string | string[]>;
};

type SetNavigationStateInput = {
  pathname?: string;
  searchParams?: URLSearchParams | Record<string, string>;
  params?: Record<string, string | string[]>;
};

const defaultState: NavigationState = {
  pathname: "/",
  searchParams: new URLSearchParams(),
  params: {},
};

let state: NavigationState = { ...defaultState };

export const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

export function setNavigationState(input: SetNavigationStateInput = {}): void {
  state = {
    params: input.params ?? { ...defaultState.params },
    pathname: input.pathname ?? defaultState.pathname,
    searchParams: toSearchParams(input.searchParams ?? defaultState.searchParams),
  };
}

function toSearchParams(value: URLSearchParams | Record<string, string>): URLSearchParams {
  if (value instanceof URLSearchParams) return new URLSearchParams(value);
  return new URLSearchParams(value);
}

export function useRouter() {
  return routerMock;
}

export function usePathname(): string {
  return state.pathname;
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(state.searchParams);
}

export function useParams<
  T extends Record<string, string | string[]> = Record<string, string | string[]>,
>(): T {
  return state.params as T;
}

export const redirect = vi.fn();

export const notFound = vi.fn();

export const unstable_rethrow = vi.fn();

beforeEach(() => {
  state = {
    params: { ...defaultState.params },
    pathname: defaultState.pathname,
    searchParams: new URLSearchParams(defaultState.searchParams),
  };
  routerMock.push.mockReset();
  routerMock.replace.mockReset();
  routerMock.refresh.mockReset();
  routerMock.back.mockReset();
  routerMock.forward.mockReset();
  routerMock.prefetch.mockReset();
  redirect.mockReset();
  notFound.mockReset();
  unstable_rethrow.mockReset();
});
