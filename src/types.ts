export type DbKind = 'sqlserver' | 'db2';

export interface DbConfig {
  kind: DbKind;
  server: string;
  database: string;
  user: string;
  password: string;
  port?: number;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable?: boolean;
}

export interface QueryResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
}

export interface DbAdapter {
  connect(): Promise<void>;
  close(): Promise<void>;
  listSchemas(): Promise<string[]>;
  listTables(schema?: string): Promise<{ schema: string; name: string; type: string }[]>;
  preview(query: string, limit?: number): Promise<QueryResult>;
  streamQuery(query: string, onBatch: (rows: Record<string, unknown>[]) => Promise<void>, batchSize: number): Promise<number>;
  insertBatch(schema: string, table: string, columns: string[], rows: Record<string, unknown>[]): Promise<void>;
}
