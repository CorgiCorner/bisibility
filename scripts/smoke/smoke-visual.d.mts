import type { attachOperaForTests } from "./attached-opera-playwright.mjs";

type Story = { id: string; title?: string; name?: string };
type VisualBrowser = {
  preflight(): Promise<void>;
  open(): Promise<void>;
  capture(url: string, file: string): Promise<number>;
  dispose(): Promise<void>;
};
export function verifyVisualPng(file: string, expectedWidth?: number): Promise<void>;
export function createVisualBrowser(
  environment?: NodeJS.ProcessEnv,
  attach?: typeof attachOperaForTests,
): VisualBrowser;
export function selectStories<T extends Story>(stories: readonly T[]): T[];
export function runVisualSmoke(options?: {
  browser?: VisualBrowser;
  prepare?: () => Promise<Story[]>;
  serve?: () => Promise<{ port: number; server: { close(): unknown } }>;
  log?: (message: string) => void;
  verify?: (file: string, expectedWidth?: number) => Promise<void>;
}): Promise<void>;

export function isMainModule(moduleUrl: string, script?: string): boolean;
