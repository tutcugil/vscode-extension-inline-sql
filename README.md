# Inline SQL

A Visual Studio Code extension that provides **syntax highlighting**, **autocomplete**, **validation**, and **formatting** for SQL strings embedded in your code.

No markers or special tags required — SQL is detected automatically.

## Getting Started

Requires VS Code 1.85 or later. To install a locally built release, run **Extensions: Install from VSIX...** from the Command Palette and choose the `.vsix` file.

Open a supported source file containing SQL, for example:

```typescript
const query = `select id, name from users where active = true`;
```

SQL highlighting, keyword completion and validation work without a database connection. Place the cursor inside the string and run **Inline SQL: Format SQL at Cursor**, or use **Inline SQL: Format All SQL in File**. To share formatting preferences with other tools, add the [configuration file](#shared-sql-formatterjson-configuration) described below.

See [CHANGELOG.md](CHANGELOG.md) for release notes and [CONTRIBUTING.md](CONTRIBUTING.md) for development and packaging instructions.

## Supported Languages

| Language | String Types |
|----------|-------------|
| TypeScript / JavaScript (including TSX / JSX) | Template literals, single/double quotes |
| Python | Single/double/triple quotes, f-strings |
| Java | Double quotes, text blocks (`"""`) |
| C# | Regular, verbatim (`@"`), interpolated (`$"`), raw string literals (`$"""`) |

## Features

### Syntax Highlighting

SQL keywords, types, functions, and literals are highlighted inside string literals with categorized colors. Works with both light and dark themes.

### Autocomplete

- **SQL Keywords** — DML statements, clauses, JOIN variants, functions
- **Snippet Templates** — e.g. `SELECT ... FROM ...`, `INSERT INTO ... VALUES ...`
- **Schema-Aware** (optional) — Table and column names from a live database connection

Triggers on `.` (for `table.column`) and `Space` (after keywords).

### Validation / Linting

- Real-time SQL syntax checking
- **Auto-dialect detection** — C# files use TransactSQL, others default to MySQL
- Configurable dialect: `auto`, `mysql`, `postgresql`, `transactsql`, `sqlite`
- Smart skip for SQL fragments and T-SQL specific syntax
- **Multi-statement T-SQL blocks** — `SET XACT_ABORT`, `BEGIN TRANSACTION`, `DECLARE` blocks are split into individual statements; procedural commands are skipped while DML statements (INSERT, DELETE, UPDATE, SELECT) are validated
- Interpolation placeholders are normalized for parser compatibility

### Formatting

- Format SQL at cursor position or all SQL strings in file
- Configurable indent, keyword casing, and dialect
- Shared `.sql-formatter.json` support with automatic discovery inside the workspace
- Preserves host code indentation and interpolation expressions
- Escapes inserted newlines in ordinary quoted strings
- Leaves strings with host-language escapes, multiline SQL values and single-line raw strings unchanged when safe rewriting is not supported

## Commands

| Command | Description |
|---------|-------------|
| `Inline SQL: Format SQL at Cursor` | Format the SQL string under the cursor |
| `Inline SQL: Format All SQL in File` | Format every detected SQL string in the file |
| `Inline SQL: Refresh Schema Cache` | Refresh the database schema cache |

## Settings

All settings are under the `inlineSql.*` namespace.

### Detection

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `inlineSql.languages` | string[] | all supported languages | Enabled VS Code language IDs: `typescript`, `javascript`, `typescriptreact`, `javascriptreact`, `python`, `java`, `csharp` |
| `inlineSql.detection.minKeywords` | integer | `2` | Minimum distinct SQL keywords for scoring-based detection; range 1–100. Strings starting with a SQL statement keyword use the fast path instead. |

### Validation

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `inlineSql.validation.enabled` | boolean | `true` | Enable/disable SQL linting |
| `inlineSql.validation.dialect` | string | `"auto"` | SQL dialect (`auto`, `mysql`, `postgresql`, `transactsql`, `sqlite`) |

When set to `auto`, the dialect is inferred from the host language:

| Host Language | Dialect |
|---------------|---------|
| C# | TransactSQL |
| TypeScript / TSX, JavaScript / JSX, Python, Java | MySQL |

### Formatting

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `inlineSql.formatting.indent` | integer | `4` | SQL indentation spaces; range 0–16 |
| `inlineSql.formatting.uppercase` | boolean | `true` | Uppercase SQL keywords; `false` preserves existing casing |
| `inlineSql.formatting.dialect` | string | `"sql"` | Formatter dialect |

These formatting settings can be set per workspace folder. Formatting and validation have separate dialect settings: `.sql-formatter.json` does not change `inlineSql.validation.dialect`.

#### Shared `.sql-formatter.json` configuration

Starting with **0.2.0**, both formatting commands automatically read `.sql-formatter.json`, so the extension and the `sql-formatter` CLI can share formatting preferences:

```json
{
  "language": "postgresql",
  "tabWidth": 2,
  "keywordCase": "upper",
  "useTabs": false,
  "linesBetweenQueries": 1
}
```

The extension searches from the source file's directory up to its owning workspace folder, including that folder. The nearest file wins; parent configuration files are not merged. In multi-root and remote workspaces, each document uses its own workspace folder. Untitled documents and files outside a workspace use VS Code settings.

Values in the JSON file override the extension's settings. Missing `language`, `tabWidth`, and `keywordCase` values use `inlineSql.formatting.dialect`, `inlineSql.formatting.indent`, and `inlineSql.formatting.uppercase`, respectively. Other omitted options use the formatter's defaults. Saved changes, additions and deletions take effect on the next formatting command, without restarting VS Code.

For example, `src/.sql-formatter.json` takes precedence over a file at the project root when formatting `src/query.ts`. Configuration outside the owning workspace folder is never searched. To keep CLI and extension formatting consistent, explicitly set `language`, `tabWidth` and `keywordCase` in the shared file; omitted values can differ because the extension falls back to VS Code settings.

Supported options: `language`, `tabWidth`, `useTabs`, `keywordCase`, `identifierCase`, `dataTypeCase`, `functionCase`, `indentStyle`, `logicalOperatorNewline`, `expressionWidth`, `linesBetweenQueries`, `denseOperators`, and `newlineBeforeSemicolon`. `$schema` metadata is accepted. `params` (SQL value substitution) and `paramTypes` (placeholder parsing configuration) are not supported by this source-code formatter. Host-language interpolation expressions remain intact, including when identifier casing changes.

Use valid JSON without comments or trailing commas. Invalid JSON, unsupported options, invalid values or unreadable configuration files stop formatting with a warning; the document remains unchanged. Configuration files are limited to 64 KiB; integer limits are 0–16 for `tabWidth`, 1–10000 for `expressionWidth`, and 0–100 for `linesBetweenQueries`.

### Database Connection (Optional)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `inlineSql.connections` | array | `[]` | Database connections |
| `inlineSql.activeConnection` | string | `""` | Active connection name |
| `inlineSql.schemaCacheTTL` | integer | `300` | Cache TTL in seconds; range 1–86400 |

Define connections in **User settings** (machine scope), not repository settings. Database access and loading optional drivers require a trusted workspace, following the [VS Code Workspace Trust guide](https://code.visualstudio.com/api/extension-guides/workspace-trust). Set `passwordEnv` to an environment variable available to the VS Code extension host; plaintext `password` remains supported but is deprecated.

Connection object:

```jsonc
{
  "inlineSql.connections": [
    {
      "name": "local-dev",
      "driver": "postgres",   // postgres | mysql | mssql
      "host": "localhost",
      "port": 5432,
      "database": "mydb",
      "user": "dev",
      "passwordEnv": "INLINE_SQL_DB_PASSWORD"
    }
  ],
  "inlineSql.activeConnection": "local-dev"
}
```

> **Note**: Database drivers (`pg`, `mysql2`, `mssql`) must be installed in your workspace for schema features to work.

| Driver setting | Package to install | Default port |
|----------------|--------------------|--------------|
| `postgres` | `pg` | `5432` |
| `mysql` | `mysql2` | `3306` |
| `mssql` | `mssql` | `1433` |

Connection objects require `name`, `driver`, `host` and `database`; `port`, `user`, `passwordEnv` and the deprecated `password` are optional. When `passwordEnv` is set, it takes precedence over `password`; an undefined environment variable prevents the connection. With remote development, install the driver and provide the environment variable where the extension host runs.

Schema completion refreshes expired metadata on demand. Use **Inline SQL: Refresh Schema Cache** after changing credentials or when an immediate refresh is needed. Database queries read schema metadata; the extension does not execute the SQL strings from your source files.

## Troubleshooting

| Symptom | What to check |
|---------|---------------|
| Shared formatting settings are ignored | Save `.sql-formatter.json`, verify it is in the source directory or a parent within the workspace, and check for a nearer configuration file. |
| Formatting reports invalid configuration | Use strict JSON, supported option names and valid values. The warning identifies the configuration file; source code is left unchanged. |
| A SQL string is left unchanged | Host-language escapes, multiline SQL values and single-line raw strings are not safely rewritten. The formatter also may not support the SQL syntax or selected dialect. |
| Formatting asks you to run the command again | The source document changed while configuration was being read. Retry on the current document. |
| No database table or column suggestions | Check workspace trust, User settings, the active connection name, driver installation and the environment variable used by `passwordEnv`. |
| Formatting succeeds but validation warns | Check the separate validation dialect. Validation uses a SQL parser and skips some unsupported fragments and procedural statements; it does not validate against a live database. |

## How It Works

1. **String Extraction** — Language-specific parser extracts all string literals, handling comments, escape sequences, and nested interpolations
2. **Interpolation Replacement** — Template expressions are replaced with SQL-safe placeholders for parser compatibility
3. **Classification** — Two-tier approach:
   - **Fast path**: String starts with a SQL keyword (`SELECT`, `INSERT`, `CREATE`, etc.)
   - **Scoring**: String meets `inlineSql.detection.minKeywords` (default: 2), includes a qualifying statement keyword, and is at least 20 characters
4. **Highlighting** — Decoration API provides categorized highlighting compatible with semantic tokenization.

## License

MIT
