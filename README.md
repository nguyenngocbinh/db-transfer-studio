# DB Transfer Studio

[![CI](https://github.com/nguyenngocbinh/db-transfer-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/nguyenngocbinh/db-transfer-studio/actions/workflows/ci.yml)

Visual VS Code extension for moving data between **Microsoft SQL Server** and **IBM Db2**, with **Excel (.xlsx)** and **Parquet** import/export support.

> **Project status: MVP / early development.** Database integration and large-volume behaviour must be tested against real database instances before production use. A green CI build verifies compilation and packaging only; it does not prove that database connections or data transfers work end-to-end.

## Features planned / MVP scope

- A dedicated VS Code editor tab for DB Transfer Studio.
- SQL Server and IBM Db2 connection adapters.
- Schema and table discovery.
- Query preview before export.
- Export data to Excel and Parquet.
- Preview file data before importing.
- Batch-oriented import/export design for large datasets.
- Progress and actionable error messages.

Feature availability depends on the adapter and driver support implemented in the current version. See the README and Issues for known limitations.

## Requirements

- Visual Studio Code.
- Node.js 20 LTS recommended for development and CI.
- Database network access and an account with the required permissions.
- SQL Server driver dependencies for the `mssql` package.
- IBM Db2 client/CLI components as required by the installed `ibm_db` version.

Native dependencies may require additional Windows build tools. Follow the setup guidance for the selected driver version.

## Development on Windows

Clone the repository and open it in VS Code:

```powershell
git clone https://github.com/nguyenngocbinh/db-transfer-studio.git
cd db-transfer-studio
npm install
npm run compile
```

Press **F5** to launch the Extension Development Host. In the new VS Code window, run:

```text
DB Transfer Studio: Open Workspace
```

If the repository contains a committed `package-lock.json`, use `npm ci` for a reproducible dependency install.

## Package the extension

Install dependencies and compile first:

```powershell
npm install
npm run compile
npx vsce package
```

VS Code will create a `.vsix` package in the project directory. In VS Code, use **Extensions: Install from VSIX...** to install it locally.

GitHub Actions runs the same compile/package checks on pushes and pull requests, then publishes the VSIX as a downloadable workflow artifact.

## Configuration and security

- Do not commit passwords, connection strings, private certificates, or production data.
- Use a least-privilege database account.
- Review every import target before writing data.
- Test with a development database and a small sample first.
- For large transfers, verify row counts and representative values after the operation.
- Excel worksheets support at most 1,048,576 rows each; Parquet is preferable for larger datasets.
- A CI pass only proves that the current source compiles and can be packaged on the CI runner; separate integration tests are needed for SQL Server and Db2.

## CI workflow

Workflow file: `.github/workflows/ci.yml`

Triggers on pushes to `main` / `master`, pull requests targeting those branches, and manual dispatch. The workflow installs dependencies, compiles TypeScript, packages the extension, and uploads the generated VSIX for 14 days.

## License

Choose and add a repository license before distributing the extension publicly.
