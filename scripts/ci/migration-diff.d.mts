interface DiffResult {
  status: number | null;
  stdout?: string;
  error?: Error;
  signal?: string | null;
}
interface ContractClient {
  connect(): Promise<unknown>;
  end(): Promise<unknown>;
}
export function assertMigrationDiff(result: DiffResult, expectedScript: string): void;
export function verifyMigrationDiff(
  env: Record<string, string | undefined>,
  options?: {
    createClient?: (connectionString: string) => ContractClient;
    verifyAdditional?: (client: ContractClient, schema: string) => Promise<string>;
    capture?: (command: string, args: string[], options: object) => DiffResult;
  },
): Promise<void>;
