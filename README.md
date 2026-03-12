# Inline SQL

A Visual Studio Code extension that provides **syntax highlighting**, **autocomplete**, **validation**, and **formatting** for SQL strings embedded in your code. Supports TypeScript, JavaScript, Python, Java, and C#.

No markers or special tags required — SQL is detected automatically.

## Features

### Syntax Highlighting

SQL keywords, types, functions, and literals are highlighted inside string literals. Works with both light and dark themes.

Supported string types per language:

| Language | String Types |
|----------|-------------|
| TypeScript / JavaScript | Template literals, single/double quotes |
| Python | Single/double/triple quotes, f-strings |
| Java | Double quotes, text blocks (`"""`) |
| C# | Regular, verbatim (`@"`), interpolated (`$"`), raw string literals (`$"""`) |

### Autocomplete

- **SQL Keywords**: DML statements, clauses, JOIN variants, functions
- **Snippet Templates**: e.g. `SELECT ... FROM ...`, `INSERT INTO ... VALUES ...`
- **Schema-Aware** (optional): Table and column names from a live database connection

Triggers on `.` (for `table.column`) and `Space` (after keywords).

### Validation / Linting

- Real-time SQL syntax checking with `node-sql-parser`
- **Auto-dialect detection**: C# files use TransactSQL, others default to MySQL
- Configurable dialect: `auto`, `mysql`, `postgresql`, `transactsql`, `sqlite`
- Smart skip for SQL fragments (`SET`, `BEGIN`, `COMMIT`, `DECLARE`, `UNION ALL`, etc.)
- Interpolation placeholders are normalized for parser compatibility

### Formatting

- Format SQL at cursor position or all SQL strings in file
- Configurable indent, keyword casing, and dialect
- Preserves host code indentation

## Installation

### From VS Code Marketplace

Search for **"Inline SQL"** in the Extensions sidebar, or:

```
ext install tutcugil.vscode-extension-inline-sql
```

### From VSIX File

```bash
code --install-extension inline-sql-x.x.x.vsix
```

Or in VS Code: **Extensions sidebar** > `...` menu > **Install from VSIX...**

### From GitHub Releases

Download the latest `.vsix` from [Releases](https://github.com/tutcugil/vscode-extension-inline-sql/releases) and install manually.

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
| `inlineSql.languages` | string[] | all languages | Enabled host languages |
| `inlineSql.detection.minKeywords` | number | `2` | Minimum distinct SQL keywords for scoring-based detection |

### Validation

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `inlineSql.validation.enabled` | boolean | `true` | Enable/disable SQL linting |
| `inlineSql.validation.dialect` | string | `"auto"` | SQL dialect (`auto`, `mysql`, `postgresql`, `transactsql`, `sqlite`) |

When set to `auto`, the dialect is inferred from the host language:

| Host Language | Dialect |
|---------------|---------|
| C# | TransactSQL |
| TypeScript, JavaScript, Python, Java | MySQL |

### Formatting

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `inlineSql.formatting.indent` | number | `4` | SQL indentation spaces |
| `inlineSql.formatting.uppercase` | boolean | `true` | Uppercase SQL keywords |
| `inlineSql.formatting.dialect` | string | `"sql"` | Formatter dialect |

### Database Connection (Optional)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `inlineSql.connections` | array | `[]` | Database connections |
| `inlineSql.activeConnection` | string | `""` | Active connection name |
| `inlineSql.schemaCacheTTL` | number | `300` | Cache TTL in seconds |

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
      "user": "dev"
    }
  ],
  "inlineSql.activeConnection": "local-dev"
}
```

> **Note**: Database drivers (`pg`, `mysql2`, `mssql`) must be installed in your workspace for schema features to work.

## How It Works

### SQL Detection

1. **String Extraction** — Language-specific parser extracts all string literals, handling comments, escape sequences, and nested interpolations
2. **Interpolation Replacement** — Template expressions are replaced with SQL-safe placeholders (`@__p__` for C#, `__P__` for others)
3. **Classification** — Two-tier approach:
   - **Fast path**: String starts with a SQL keyword (`SELECT`, `INSERT`, `CREATE`, etc.)
   - **Scoring**: String contains 2+ distinct SQL keywords and is at least 20 characters

### Highlighting

Two layers work together:
- **TextMate Grammar Injection** — Provides base SQL syntax scopes inside host language strings
- **Decoration API** — Adds categorized highlighting (DML, clauses, types, functions, identifiers, punctuation) that works even when VS Code's semantic tokenization is active

## Development

### Prerequisites

- Node.js 20+
- VS Code 1.85+

### Setup

```bash
git clone https://github.com/tutcugil/vscode-extension-inline-sql.git
cd vscode-extension-inline-sql
npm install
```

### Build & Run

```bash
npm run compile     # Development build
npm run watch       # Watch mode
npm run package     # Production build
```

Press **F5** in VS Code to launch the Extension Development Host.

### Test

```bash
npm run test:unit   # Unit tests (Mocha)
npm run lint        # ESLint
```

### Package

```bash
npx @vscode/vsce package --no-dependencies
```

## Project Structure

```
src/
├── extension.ts                 # Entry point
├── types.ts                     # Shared types
├── detection/
│   ├── sqlDetector.ts           # SQL detection engine
│   ├── stringExtractor.ts       # Language-specific string extraction
│   └── patterns.ts              # SQL keyword patterns
├── highlighting/
│   └── sqlDecorationProvider.ts # Decoration-based highlighting
├── completion/
│   ├── sqlCompletionProvider.ts # Autocomplete provider
│   └── sqlKeywords.ts           # Keyword + snippet definitions
├── validation/
│   └── sqlDiagnosticsProvider.ts # Syntax validation
├── formatting/
│   └── sqlFormattingProvider.ts  # SQL formatting
└── db/
    ├── connectionManager.ts     # Database connection management
    └── schemaCache.ts           # Schema metadata cache

syntaxes/                        # TextMate grammar injection files
test/                            # Unit tests and fixtures
```

## CI/CD

Automated via GitHub Actions (`.github/workflows/release.yml`):

- **Trigger**: PR merged to `test` or `prod` branch
- **test branch**: Creates a prerelease with `-test` version suffix
- **prod branch**: Creates a stable release + publishes to VS Code Marketplace
- Both branches publish to GitHub Packages

## License

MIT
