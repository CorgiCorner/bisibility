"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export type RegisteredCommand = {
  id: string;
  label: string;
  scope: string;
  hint: string;
  run: () => void | Promise<void>;
};

type CommandsRef = { current: readonly RegisteredCommand[] };

type RegistryContextValue = {
  commands: RegisteredCommand[];
  register: (scope: string, commandsRef: CommandsRef) => () => void;
};

const RegistryContext = createContext<RegistryContextValue>({
  commands: [],
  register: () => () => {},
});

export function useRegisteredCommands(): RegisteredCommand[] {
  return useContext(RegistryContext).commands;
}

type ScopeEntry = { commandsRef: CommandsRef };

export function CommandRegistryProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [scopes, setScopes] = useState<Map<string, ScopeEntry>>(new Map());

  const register = useCallback((scope: string, commandsRef: CommandsRef) => {
    setScopes((prev) => {
      const next = new Map(prev);
      next.set(scope, { commandsRef });
      return next;
    });

    return () => {
      setScopes((prev) => {
        const existing = prev.get(scope);
        if (existing?.commandsRef === commandsRef) {
          const next = new Map(prev);
          next.delete(scope);
          return next;
        }
        return prev;
      });
    };
  }, []);

  const commands = useMemo(() => {
    const seen = new Set<string>();
    const result: RegisteredCommand[] = [];
    for (const entry of scopes.values()) {
      for (const cmd of entry.commandsRef.current) {
        if (seen.has(cmd.id)) {
          continue;
        }
        seen.add(cmd.id);
        result.push(proxyCommand(cmd, entry.commandsRef));
      }
    }
    return result;
  }, [scopes]);

  const value = useMemo(() => ({ commands, register }), [commands, register]);

  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>;
}

function proxyCommand(cmd: RegisteredCommand, commandsRef: CommandsRef): RegisteredCommand {
  return {
    id: cmd.id,
    label: cmd.label,
    scope: cmd.scope,
    hint: cmd.hint,
    run: () => {
      const latest = commandsRef.current.find((c) => c.id === cmd.id);
      return latest ? latest.run() : Promise.resolve();
    },
  };
}

export function useRegisterCommands(commands: readonly RegisteredCommand[]) {
  const { register } = useContext(RegistryContext);
  const cleanupRef = useRef<(() => void) | null>(null);

  if (commands.length > 0) {
    validateScope(commands);
    validateIds(commands);
  }

  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  const scope = commands.length > 0 ? commands[0].scope : "";
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  const structureKey = useMemo(
    () => commands.map((c) => `${c.scope}\0${c.id}\0${c.label}\0${c.hint}`).join("\x01"),
    [commands],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: structureKey forces callback ref reattachment on structural changes without being read in the body.
  return useCallback(
    (node: HTMLSpanElement | null) => {
      if (node !== null && scopeRef.current) {
        cleanupRef.current?.();
        cleanupRef.current = register(scopeRef.current, commandsRef);
      } else if (node === null) {
        cleanupRef.current?.();
        cleanupRef.current = null;
      }
    },
    [register, structureKey],
  );
}

function validateScope(commands: readonly RegisteredCommand[]) {
  const scope = commands[0].scope;
  for (const cmd of commands) {
    if (cmd.scope !== scope) {
      throw new Error(
        `useRegisterCommands: all commands in one registration must share the same scope, got "${scope}" and "${cmd.scope}"`,
      );
    }
  }
}

function validateIds(commands: readonly RegisteredCommand[]) {
  const ids = new Set<string>();
  for (const cmd of commands) {
    if (ids.has(cmd.id)) {
      throw new Error(
        `useRegisterCommands: duplicate command id "${cmd.id}" within one registration`,
      );
    }
    ids.add(cmd.id);
  }
}
