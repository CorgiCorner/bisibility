interface DiffResult {
  status: number | null;
  stdout?: string;
  error?: Error;
  signal?: string | null;
}
interface ContractClient {
  connect(): Promise<unknown>;
  end(): Promise<unknown>;
  query(sql: string, parameters: string[]): Promise<{ rows: unknown[] }>;
}
export function verifyProviderIncidentIndex(client: Pick<ContractClient, "query">, schema: string): Promise<void>;
export function assertMigrationDiff(result: DiffResult, expectedScript: string): void;
export function verifyMigrationDiff(
  env: Record<string, string | undefined>,
  options?: {
    createClient?: (connectionString: string) => ContractClient;
    verifyAdditional?: (client: ContractClient, schema: string) => Promise<string>;
    verifyIncidentIndex?: (client: ContractClient, schema: string) => Promise<void>;
    capture?: (command: string, args: string[], options: object) => DiffResult;
  },
): Promise<void>;
