# Contributing

Thanks for your interest in contributing to Inline SQL!

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
