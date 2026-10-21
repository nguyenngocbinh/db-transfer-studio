import sql from 'mssql';
import { DbAdapter, DbConfig, QueryResult } from '../types';

export class SqlServerAdapter implements DbAdapter {
  private pool?: sql.ConnectionPool;
  constructor(private readonly config: DbConfig) {}

  async connect(): Promise<void> {
    this.pool = await new sql.ConnectionPool({
      server: this.config.server, port: this.config.port ?? 1433, database: this.config.database,
      user: this.config.user, password: this.config.password,
      options: { encrypt: this.config.encrypt ?? false, trustServerCertificate: this.config.trustServerCertificate ?? true },
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 }, requestTimeout: 0
    }).connect();
  }
  async close(): Promise<void> { await this.pool?.close(); this.pool = undefined; }
  private getPool(): sql.ConnectionPool {
    if (!this.pool) throw new Error('SQL Server chưa kết nối.');
    return this.pool;
  }

  async listSchemas(): Promise<string[]> {
    const result = await this.getPool().request().query("SELECT name FROM sys.schemas WHERE name NOT IN ('sys','INFORMATION_SCHEMA') ORDER BY name");
    return result.recordset.map((row: { name: string }) => row.name);
  }

  async listTables(schema?: string): Promise<{ schema: string; name: string; type: string }[]> {
    const request = this.getPool().request();
    request.input('schema', sql.NVarChar, schema ?? null);
    const result = await request.query(`
      SELECT s.name AS [schema], o.name,
             CASE WHEN o.type = 'V' THEN 'VIEW' ELSE 'TABLE' END AS type
      FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
      WHERE o.type IN ('U','V') AND (@schema IS NULL OR s.name = @schema)
      ORDER BY s.name, o.name
    `);
    return result.recordset;
  }

  async preview(query: string, limit = 100): Promise<QueryResult> {
    const clean = query.trim().replace(/;\s*$/, '');
    if (!/^select\b/i.test(clean)) throw new Error('Chỉ cho phép câu SELECT trong preview/export.');
    const result = await this.getPool().request()
      .input('previewLimit', sql.Int, Math.max(1, Math.min(1000, limit)))
      .query(`SELECT TOP (@previewLimit) * FROM (${clean}) AS preview_src`);
    // mssql exposes column metadata on the recordset at runtime; its IResult
    // type does not declare a top-level "columns" property.
    const columnMetadata = (result.recordset as any).columns ?? {};
    const columns = Object.keys(columnMetadata).map(name => ({
      name,
      type: String(columnMetadata[name]?.type?.name ?? 'unknown')
    }));
    return { columns, rows: result.recordset };
  }

  async streamQuery(query: string, onBatch: (rows: Record<string, unknown>[]) => Promise<void>, batchSize: number): Promise<number> {
    const clean = query.trim().replace(/;\s*$/, '');
    if (!/^select\b/i.test(clean)) throw new Error('Chỉ cho phép câu SELECT trong export.');
    const request = this.getPool().request();
    request.stream = true;
    let count = 0;
    let batch: Record<string, unknown>[] = [];
    let pending = Promise.resolve();
    let streamError: Error | undefined;
    request.on('row', (row: Record<string, unknown>) => {
      batch.push(row); count++;
      if (batch.length >= batchSize) {
        request.pause();
        const current = batch; batch = [];
        pending = pending.then(() => onBatch(current)).then(() => {
          request.resume();
        }).catch(error => {
          streamError = error instanceof Error ? error : new Error(String(error));
          request.cancel();
        });
      }
    });
    await new Promise<void>((resolve, reject) => {
      request.on('error', reject);
      request.on('done', resolve);
      request.query(clean);
    });
    await pending;
    if (streamError) throw streamError;
    if (batch.length) await onBatch(batch);
    return count;
  }

  async insertBatch(schema: string, table: string, columns: string[], rows: Record<string, unknown>[]): Promise<void> {
    if (!rows.length) return;
    const quote = (value: string) => `[${value.replace(/]/g, ']]')}]`;
    const chunkSize = Math.max(1, Math.min(rows.length, Math.floor(2000 / columns.length)));
    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const chunk = rows.slice(offset, offset + chunkSize);
      const request = this.getPool().request();
      const values = chunk.map((row, i) => '(' + columns.map((column, j) => {
        const name = `p_${i}_${j}`;
        request.input(name, row[column] as any ?? null);
        return '@' + name;
      }).join(',') + ')').join(',');
      await request.query(`INSERT INTO ${quote(schema)}.${quote(table)} (${columns.map(quote).join(',')}) VALUES ${values}`);
    }
  }
}
