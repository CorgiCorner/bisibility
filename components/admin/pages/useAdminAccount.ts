"use client";
import { lookupOssAdminAccount } from "@/lib/actions/instance-admin-pages";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAdminQuery } from "./useAdminQuery";

/** URL-selected details use the audited reader, independent of the current table page. */
export function useAdminAccount() {
  const query = useAdminQuery();
  const t = useTranslations("instanceAdmin.account.lookup");
  const [client] = useState(() => new QueryClient());
  const identifier = query.params?.get("account") ?? "";
  const detail = useQuery(
    {
      queryKey: ["admin-account", identifier],
      queryFn: () => lookupOssAdminAccount(identifier),
      enabled: !!identifier,
      retry: false,
      staleTime: 30_000,
    },
    client,
  );
  const error =
    detail.isSuccess && detail.data === null
      ? t("forbidden")
      : detail.isError || detail.data?.status === "failed"
        ? t("temporarilyUnavailable")
        : detail.data?.status === "rate_limited"
          ? t("rateLimited")
          : undefined;
  return {
    account: detail.data?.account ?? null,
    error,
    busy: detail.isFetching || query.pending,
    drawer: query.params?.get("drawer") === "account",
    identifier,
    lookup: (value: string, inDrawer = false) => {
      // Start the same cached read immediately while the router commits its URL.
      void client
        .fetchQuery({
          queryKey: ["admin-account", value],
          queryFn: () => lookupOssAdminAccount(value),
          staleTime: 30_000,
        })
        .catch(() => {});
      query.update({ account: value, drawer: inDrawer ? "account" : undefined });
    },
    reload: () => client.invalidateQueries({ queryKey: ["admin-account"] }),
    close: () => query.update({ account: undefined, drawer: undefined }),
  };
}
