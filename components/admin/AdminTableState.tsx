"use client";
import type { DataTableSort } from "@/components/ui/data-table/data-table-types";
import { createContext, useCallback, useContext, useState } from "react";
export const AdminTableState = createContext<{
  get: (key: string) => string | null;
  update: (values: Record<string, string | undefined>) => void;
} | null>(null);
/** Storybook and legacy routes keep local state; real routes persist table state in the URL. */
export function useAdminTableSort(table: string, initial: DataTableSort | null = null) {
  const route = useContext(AdminTableState);
  const [local, setLocal] = useState(initial);
  const field = route?.get(`${table}Sort`);
  const sort: DataTableSort | null =
    field === "none"
      ? null
      : field
        ? {
            field,
            direction: route?.get(`${table}Direction`) === "desc" ? "desc" : "asc",
          }
        : route
          ? initial
          : local;
  const setSort = (next: DataTableSort | null) => {
    if (route)
      route.update({
        [`${table}Sort`]: next?.field ?? "none",
        [`${table}Direction`]: next?.direction,
      });
    else setLocal(next);
  };
  return [sort, setSort] as const;
}
export function useAdminTableGroup(table: string) {
  const route = useContext(AdminTableState);
  const [local, setLocal] = useState("none");
  return [
    route?.get(`${table}Group`) ?? local,
    (value: string) => {
      if (route) route.update({ [`${table}Group`]: value });
      else setLocal(value);
    },
  ] as const;
}

/** Real routes read from the URL on every render, including browser history navigation. */
export function useAdminViewState(key: string, initial: string | null = null) {
  const route = useContext(AdminTableState);
  const [local, setLocal] = useState(initial);
  const update = useCallback(
    (value: string | null) => {
      if (route) route.update({ [key]: value ?? undefined });
      else setLocal(value);
    },
    [route, key],
  );
  return [route ? route.get(key) : local, update] as const;
}

function selectedTokens(value: string | null): string[] {
  try {
    const data: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(data) &&
      data.length <= 25 &&
      data.every((v) => typeof v === "string" && v.length <= 32768)
      ? [...new Set(data)]
      : [];
  } catch {
    return [];
  }
}
export function useAdminSelection() {
  const route = useContext(AdminTableState);
  const [local, setLocal] = useState<string[]>([]);
  const update = useCallback(
    (next: string[] | ((current: string[]) => string[])) => {
      if (route) {
        const current = selectedTokens(route.get("selected"));
        const values = typeof next === "function" ? next(current) : next;
        route.update({ selected: values.length ? JSON.stringify(values) : undefined });
      } else setLocal(next);
    },
    [route],
  );
  return [route ? selectedTokens(route.get("selected")) : local, update] as const;
}
