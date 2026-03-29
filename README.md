# Inline SQL

A Visual Studio Code extension that provides **syntax highlighting**, **autocomplete**, **validation**, and **formatting** for SQL strings embedded in your code.

No markers or special tags required — SQL is detected automatically.

## Supported Languages

| Language | String Types |
|----------|-------------|
| TypeScript / JavaScript | Template literals, single/double quotes |
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
- Preserves host code indentation

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

1. **String Extraction** — Language-specific parser extracts all string literals, handling comments, escape sequences, and nested interpolations
2. **Interpolation Replacement** — Template expressions are replaced with SQL-safe placeholders for parser compatibility
3. **Classification** — Two-tier approach:
   - **Fast path**: String starts with a SQL keyword (`SELECT`, `INSERT`, `CREATE`, etc.) and is at least 20 characters
   - **Scoring**: String contains 2+ distinct SQL keywords (including at least one statement keyword) and is at least 20 characters
4. **Highlighting** — Two layers work together:
   - **TextMate Grammar Injection** for base SQL syntax scopes
   - **Decoration API** for categorized highlighting that works with semantic tokenization

## License

MIT
