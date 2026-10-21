import ExcelJS from 'exceljs';
import * as parquet from 'parquetjs-lite';
import { DbAdapter } from '../types';

export interface FilePreview {
  columns: string[];
  rows: Record<string, unknown>[];
  totalPreviewRows: number;
}

export async function previewFile(filePath: string, maxRows = 100): Promise<FilePreview> {
  if (filePath.toLowerCase().endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('Excel không có worksheet.');
    const columns: string[] = [];
    sheet.getRow(1).eachCell(cell => columns.push(String(cell.value ?? '')));
    const rows: Record<string, unknown>[] = [];
    for (let i = 2; i <= Math.min(sheet.rowCount, maxRows + 1); i++) {
      const row = sheet.getRow(i);
      const item: Record<string, unknown> = {};
      columns.forEach((column, index) => item[column] = row.getCell(index + 1).value);
      rows.push(item);
    }
    return { columns, rows, totalPreviewRows: rows.length };
  }
  if (filePath.toLowerCase().endsWith('.parquet')) {
    const reader = await parquet.ParquetReader.openFile(filePath);
    try {
      const cursor = reader.getCursor();
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < maxRows; i++) {
        const row = await cursor.next();
        if (!row) break;
        rows.push(row);
      }
      return { columns: Object.keys(rows[0] ?? {}), rows, totalPreviewRows: rows.length };
    } finally {
      await reader.close();
    }
  }
  throw new Error('Chỉ hỗ trợ file .xlsx và .parquet.');
}

export async function importFile(
  db: DbAdapter, filePath: string, schema: string, table: string, columns: string[],
  batchSize: number, progress: (count: number) => void
): Promise<number> {
  let count = 0;
  if (filePath.toLowerCase().endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('Excel không có worksheet.');
    const headers: string[] = [];
    sheet.getRow(1).eachCell(cell => headers.push(String(cell.value ?? '')));
    const selected = headers.filter(header => columns.includes(header));
    if (!selected.length) throw new Error('Không có cột mapping nào khớp header Excel.');
    let batch: Record<string, unknown>[] = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const item: Record<string, unknown> = {};
      selected.forEach(header => item[header] = row.getCell(headers.indexOf(header) + 1).value ?? null);
      batch.push(item);
      if (batch.length >= batchSize) {
        await db.insertBatch(schema, table, selected, batch);
        count += batch.length; progress(count); batch = [];
      }
    }
    if (batch.length) { await db.insertBatch(schema, table, selected, batch); count += batch.length; progress(count); }
    return count;
  }

  if (filePath.toLowerCase().endsWith('.parquet')) {
    const reader = await parquet.ParquetReader.openFile(filePath);
    try {
      const cursor = reader.getCursor();
      let batch: Record<string, unknown>[] = [];
      while (true) {
        const row = await cursor.next();
        if (!row) break;
        const item: Record<string, unknown> = {};
        columns.forEach(column => item[column] = row[column] ?? null);
        batch.push(item);
        if (batch.length >= batchSize) {
          await db.insertBatch(schema, table, columns, batch);
          count += batch.length; progress(count); batch = [];
        }
      }
      if (batch.length) { await db.insertBatch(schema, table, columns, batch); count += batch.length; progress(count); }
      return count;
    } finally { await reader.close(); }
  }
  throw new Error('Chỉ hỗ trợ file .xlsx và .parquet.');
}
