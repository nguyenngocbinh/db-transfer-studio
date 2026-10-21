import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import * as parquet from 'parquetjs-lite';
import { DbAdapter } from '../types';

export async function exportQuery(
  db: DbAdapter, query: string, filePath: string, format: 'xlsx' | 'parquet',
  batchSize: number, progress: (count: number) => void
): Promise<number> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  let count = 0;

  if (format === 'xlsx') {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: filePath, useStyles: false, useSharedStrings: false });
    const sheet = workbook.addWorksheet('Data');
    let headerWritten = false;
    await db.streamQuery(query, async rows => {
      if (!headerWritten && rows.length) {
        sheet.columns = Object.keys(rows[0]).map(key => ({ header: key, key }));
        headerWritten = true;
      }
      for (const row of rows) sheet.addRow(row).commit();
      count += rows.length;
      progress(count);
    }, batchSize);
    sheet.commit();
    await workbook.commit();
    return count;
  }

  let writer: any;
  let schema: Record<string, { type: string }> | undefined;
  await db.streamQuery(query, async rows => {
    if (!writer && rows.length) {
      schema = {};
      for (const [key, value] of Object.entries(rows[0])) {
        schema[key] = { type: value == null ? 'UTF8' : typeof value === 'boolean' ? 'BOOLEAN' : typeof value === 'number' ? (Number.isInteger(value) ? 'INT64' : 'DOUBLE') : 'UTF8' };
      }
      writer = await parquet.ParquetWriter.openFile(new parquet.ParquetSchema(schema), filePath, { compression: 'GZIP' });
    }
    if (writer && schema) {
      for (const row of rows) {
        const safe: Record<string, unknown> = {};
        for (const key of Object.keys(schema)) {
          const value = row[key];
          safe[key] = value == null ? null : typeof value === 'object' ? JSON.stringify(value) : value;
        }
        await writer.appendRow(safe);
      }
    }
    count += rows.length;
    progress(count);
  }, batchSize);
  if (!writer) throw new Error('Query không trả về dòng dữ liệu; không suy ra được schema Parquet.');
  await writer.close();
  return count;
}
