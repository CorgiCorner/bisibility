import "server-only";
import { deliverModelPlaygroundTerminalReport } from "./report-terminal";
import { modelPlaygroundRuntimeBindings } from "./runtime-bindings";

/** Both process entries import this module. It is the only hook install point. */
modelPlaygroundRuntimeBindings.onTerminal = deliverModelPlaygroundTerminalReport;

export const modelPlaygroundRegistration = modelPlaygroundRuntimeBindings;
