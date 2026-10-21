# DB Transfer Studio

[![CI](https://github.com/nguyenngocbinh/db-transfer-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/nguyenngocbinh/db-transfer-studio/actions/workflows/ci.yml)

Visual VS Code extension for importing and exporting data with a dedicated editor tab. The MVP includes adapters for **Microsoft SQL Server** and **IBM Db2**, plus **Excel (.xlsx)** and **Parquet** file handling.

> **Status: MVP / early development.** The source code is now present in this repository, but end-to-end database integration has not yet been verified. CI compilation/package checks do not prove that connections or data transfers work against your environment.

## Current source layout

```text
src/
  extension.ts          VS Code command and Webview UI
  types.ts              Shared adapter contracts
  parquetjs-lite.d.ts   TypeScript declaration for ParquetJS Lite
  db/
    index.ts            Adapter factory
    sqlserver.ts        SQL Server adapter
    db2.ts              IBM Db2 adapter
  transfer/
    export.ts           XLSX streaming writer and Parquet export
    import.ts           File preview and batch-oriented import
```

## MVP functionality

- Opens a dedicated **DB Transfer Studio** editor tab from the Command Palette.
- Connects using SQL Server username/password or IBM Db2 connection credentials.
- Lists schemas and tables through adapter methods.
- Previews a SQL SELECT query before export.
- Exports query results to Excel or Parquet when the selected adapter supports streaming.
- Previews an Excel or Parquet file before import.
- Imports selected columns to an existing target table in batches.
- Shows progress/error messages and asks for confirmation before importing.

## Known limitations

- **IBM Db2 streaming export is not implemented yet.** The adapter intentionally raises an explicit error rather than materializing a large query result in memory.
- SQL Server streaming export is implemented in the source but still needs integration testing with real queries and large datasets.
- Excel import uses the non-streaming ExcelJS workbook reader and may consume substantial memory for large workbooks. Prefer Parquet for large files.
- Import inserts into an existing table. It does not create target tables, truncate, upsert, or provide an all-file transaction/rollback guarantee. If a later batch fails, earlier batches may already have been inserted.
- Column mapping currently expects file column names to match target column names.
- The current UI accepts a SQL SELECT query directly; a full database tree/table picker is planned.
- Database password is held in the Webview/session memory and is not yet stored in VS Code SecretStorage.
- No live SQL Server/Db2 integration test has been run as part of this repository setup.

Use a development database and a small sample first. Do not use this MVP for production data until import behaviour, schema/type conversion, rollback strategy, credentials handling and large-volume performance have been tested.

## Requirements

- Visual Studio Code.
- Node.js 20 LTS recommended.
- Network access to the database server and an account with least-privilege permissions.
- SQL Server driver dependency: `mssql`.
- IBM Db2 driver dependency: `ibm_db`. Native installation may require IBM Db2 CLI components and Windows build prerequisites, depending on the driver version and environment.
- Excel: `exceljs`.
- Parquet: `parquetjs-lite`.

## Install and run on Windows

Open this repository in VS Code. In PowerShell:

```powershell
npm install
npm run compile
```

Then press **F5** to launch the Extension Development Host. In the new VS Code window, open the Command Palette with `Ctrl+Shift+P` and run:

```text
DB Transfer Studio: Open Workspace
```

The repository currently does not include a committed `package-lock.json`; `npm install` creates it. Commit the lockfile after checking it into your workflow so CI can later use reproducible `npm ci` installs.

## Package a VSIX

```powershell
npm install
npm run compile
npx vsce package
```

Install the generated `.vsix` in VS Code using **Extensions: Install from VSIX...**.

## GitHub Actions

Workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

The workflow runs on pushes and pull requests to `main` / `master`, and on manual dispatch. It installs dependencies, compiles TypeScript, packages the extension and uploads a VSIX artifact for 14 days. A successful CI run only confirms that those steps passed on the runner; it is not a substitute for testing against SQL Server and IBM Db2.

## Security and data integrity

- Never commit passwords, production connection strings, private certificates, or customer data.
- Use a least-privilege account.
- Review the target schema/table and selected columns before importing.
- Verify row counts and sample values after transfers.
- Excel worksheet limit is 1,048,576 rows; Parquet is generally a better choice for large datasets.
- Treat all imported data and SQL queries as untrusted input. Run only reviewed SELECT statements for preview/export.

## Roadmap

1. Implement cursor/fetchMany-based Db2 streaming export.
2. Add schema/table explorer UI.
3. Move credentials to VS Code SecretStorage.
4. Add stronger column/type mapping and validation.
5. Add configurable staging, transaction and recovery policies.
6. Add integration tests for SQL Server and Db2, plus large-volume memory/performance tests.

## License

Add a repository license before distributing the extension publicly.
