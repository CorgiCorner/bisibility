"use client";

import { useState } from "react";

type Row = { id: string; subRows?: Row[] };

function sameOrder<T extends Row>(previous: T[], incoming: T[]): boolean {
  return (
    previous.length === incoming.length &&
    previous.every(
      (row, index) =>
        row.id === incoming[index].id &&
        sameOrder(row.subRows ?? [], incoming[index].subRows ?? []),
    )
  );
}
function inPlace<T extends Row>(previous: T[], incoming: T[]): T[] {
  const byId = new Map(incoming.map((row) => [row.id, row]));
  return previous.map((row) => {
    const next = byId.get(row.id) ?? row;
    return row.subRows ? { ...next, subRows: inPlace(row.subRows, next.subRows ?? []) } : next;
  });
}

// Keep server refreshes from moving targets during selection or editing; scope changes are explicit navigation.
export function useHeldRows<T extends Row>(
  incoming: T[],
  scope: string,
  version: number,
  alwaysHold = false,
) {
  const [state, setState] = useState({
    input: incoming,
    rows: incoming,
    scope,
    version,
    armed: false,
    pending: false,
    acceptNext: false,
  });
  if (state.scope !== scope) {
    setState({
      input: incoming,
      rows: incoming,
      scope,
      version,
      armed: false,
      pending: false,
      acceptNext: false,
    });
  } else if (state.input !== incoming || state.version !== version) {
    const armed = state.armed || state.version !== version;
    const changed = state.input !== incoming;
    const hold = !state.acceptNext && (alwaysHold || armed);
    setState({
      ...state,
      input: incoming,
      version,
      armed: changed ? false : armed,
      acceptNext: changed ? false : state.acceptNext,
      rows: changed ? (hold ? inPlace(state.rows, incoming) : incoming) : state.rows,
      pending: changed ? hold && !sameOrder(state.rows, incoming) : state.pending,
    });
  }
  function show() {
    setState((current) => ({ ...current, rows: current.input, pending: false, armed: false }));
  }
  function immediate() {
    setState((current) => ({
      ...current,
      rows: current.input,
      pending: false,
      armed: false,
      acceptNext: true,
    }));
  }
  return { rows: state.rows, pending: state.pending, show, immediate };
}
