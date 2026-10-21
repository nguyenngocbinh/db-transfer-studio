import ibmDb from 'ibm_db';
import { DbAdapter, DbConfig, QueryResult } from '../types';

export class Db2Adapter implements DbAdapter {
  private connection: any;
  constructor(private readonly config: DbConfig) {}

  async connect(): Promise<void> {
    const dsn = `DATABASE=${this.config.database};HOSTNAME=${this.config.server};PORT=${this.config.port ?? 50000};PROTOCOL=TCPIP;UID=${this.config.user};PWD=${this.config.password};`;
    this.connection = await new Promise((resolve, reject) => {
      (ibmDb as any).open(dsn, (error: Error | null, connection: any) => error ? reject(error) : resolve(connection));
    });
  }
  async close(): Promise<void> {
    if (!this.connection) return;
    await new Promise<void>((resolve, reject) => this.connection.close((error: Error | null) => error ? reject(error) : resolve()));
    this.connection = undefined;
  }
  private query(query: string, params: unknown[] = []): Promise<any[]> {
    if (!this.connection) throw new Error('IBM Db2 chưa kết nối.');
    return new Promise((resolve, reject) => this.connection.query(query, params, (error: Error | null, rows: any[]) => error ? reject(error) : resolve(rows ?? [])));
  }
  async listSchemas(): Promise<string[]> {
    const rows = await this.query('SELECT SCHEMANAME AS NAME FROM SYSCAT.SCHEMATA ORDER BY SCHEMANAME');
    return rows.map(row => row.NAME ?? row.name);
  }
  async listTables(schema?: string): Promise<{ schema: string; name: string; type: string }[]> {
    const rows = schema
      ? await this.query("SELECT TABSCHEMA AS SCHEMA, TABNAME AS NAME, TYPE FROM SYSCAT.TABLES WHERE TABSCHEMA = UPPER(?) AND TYPE IN ('T','V') ORDER BY TABNAME", [schema])
      : await this.query("SELECT TABSCHEMA AS SCHEMA, TABNAME AS NAME, TYPE FROM SYSCAT.TABLES WHERE TYPE IN ('T','V') ORDER BY TABSCHEMA,TABNAME");
    return rows.map(row => ({ schema: row.SCHEMA ?? row.schema, name: row.NAME ?? row.name, type: (row.TYPE ?? row.type) === 'V' ? 'VIEW' : 'TABLE' }));
  }
  async preview(query: string, limit = 100): Promise<QueryResult> {
    const clean = query.trim().replace(/;\s*$/, '');
    if (!/^select\b/i.test(clean)) throw new Error('Chỉ cho phép câu SELECT trong preview/export.');
    const rows = await this.query(`SELECT * FROM (${clean}) AS PREVIEW_SRC FETCH FIRST ${Math.max(1, Math.min(1000, limit))} ROWS ONLY`);
    return { columns: Object.keys(rows[0] ?? {}).map(name => ({ name, type: 'unknown' })), rows };
  }
  async streamQuery(_query: string, _onBatch: (rows: Record<string, unknown>[]) => Promise<void>, _batchSize: number): Promise<number> {
    throw new Error('Db2 streaming export chưa được triển khai trong MVP. Không tải toàn bộ dữ liệu vào RAM; cần bổ sung cursor/fetchMany cho phiên bản ibm_db đã cài.');
  }
  async insertBatch(schema: string, table: string, columns: string[], rows: Record<string, unknown>[]): Promise<void> {
    if (!this.connection) throw new Error('IBM Db2 chưa kết nối.');
    if (!rows.length) return;
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const statement = `INSERT INTO ${quote(schema)}.${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
    for (const row of rows) {
      await new Promise<void>((resolve, reject) => this.connection.query(statement, columns.map(column => row[column] ?? null), (error: Error | null) => error ? reject(error) : resolve()));
    }
  }
}
