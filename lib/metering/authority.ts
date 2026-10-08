/** Coverage describes immutable admission ownership, never a wallet balance. */
export type MeteringAuthorityQuery = {
  namespace: string;
  connectionId?: string;
  from: string;
  to: string;
};
export type MeteringAuthorityCoverage = {
  mode: "legacy" | "preparing" | "active" | "draining";
  coverage: "none" | "partial" | "full";
  windows: readonly {
    epochId: string;
    connectionId: string;
    state: "active" | "draining" | "rolled_back";
    startsAt: string;
    endsAt: string;
  }[];
};
