# Contributing

Thanks for your interest in contributing to Inline SQL!

## Development

### Prerequisites

- Node.js 24 (see `.nvmrc`; build tools require Node.js 22.13+)
- VS Code 1.85+

### Setup

```bash
git clone https://github.com/tutcugil/vscode-extension-inline-sql.git
cd vscode-extension-inline-sql
npm ci
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
npm test            # Typecheck and regression tests (Mocha)
npm run lint        # ESLint
npm run typecheck   # Typecheck without emitting files
npm audit --audit-level=moderate
```

`npm test` compiles TypeScript tests into `out/test/suite` and runs Mocha. Regression tests cover extraction, interpolation preservation, configuration discovery and validation, formatting commands, completion, and database cache isolation. VS Code APIs and database drivers are simulated in these tests; they do not launch VS Code or connect to a live database.

For manual verification in the Extension Development Host:

1. Open a supported source file and run both SQL formatting commands.
2. Add `.sql-formatter.json` at the workspace root, then add another in the source file's directory and confirm the nearest file wins.
3. Save a configuration change and format again; check that no restart is needed.
4. Try invalid JSON or an invalid option value and verify that formatting reports the file and leaves the document unchanged.
5. Check interpolation expressions, ordinary quoted strings and multiline strings. For database changes, verify schema completion against the relevant driver in a trusted workspace.

### Package

```bash
npm run vsix
```

This runs the production build through `vscode:prepublish` and writes a versioned VSIX. To choose the output path:

```bash
npm run vsix -- -o /tmp/inline-sql.vsix
```

Inspect the included files with `npx --no-install vsce ls --no-dependencies`. The `files` allowlist in `package.json` includes the bundled extension, icon, README, changelog and license. Optional database drivers are loaded from the user's workspace and are not bundled. Update the allowlist when adding a required runtime asset; local settings, tests and source maps must stay out of distribution packages.

### Shared formatter configuration

`formatterConfiguration.ts` resolves the nearest `.sql-formatter.json` through `vscode.workspace.fs`, stopping at the owning workspace folder. It reads once per formatting command without caching, so saved changes are picked up automatically. `formatOptions.ts` validates the supported formatting options before they reach `formatLiteral.ts`.

When adding an option, update the validator, the README's supported-options list and regression tests together. Preserve host interpolation expressions and check the document version after asynchronous configuration reads. The source-code formatter intentionally rejects SQL parameter substitution and placeholder-parser configuration (`params` and `paramTypes`).

## Project Structure

```
src/
├── extension.ts                 # Entry point
├── configuration.ts             # Resource-aware language and detection settings
├── types.ts                     # Shared types
├── detection/
│   ├── sqlDetector.ts           # SQL detection engine
│   ├── stringExtractor.ts       # Language-specific string extraction
│   ├── interpolations.ts        # Host expression boundaries and replacement
│   └── patterns.ts              # SQL keyword patterns
├── highlighting/
│   └── sqlDecorationProvider.ts # Decoration-based highlighting
├── completion/
│   ├── sqlCompletionProvider.ts # Autocomplete provider
│   └── sqlKeywords.ts           # Keyword + snippet definitions
├── validation/
│   └── sqlDiagnosticsProvider.ts # Syntax validation
├── formatting/
│   ├── sqlFormattingProvider.ts # Formatting commands and edit coordination
│   ├── formatterConfiguration.ts # Workspace configuration discovery
│   ├── formatOptions.ts         # Shared formatting option validation
│   └── formatLiteral.ts         # Host-safe SQL formatting
└── db/
    ├── connectionManager.ts     # Database connection management
    └── schemaCache.ts           # Schema metadata cache

syntaxes/                        # Legacy grammar files (not registered or packaged)
test/                            # Unit tests and fixtures
```

## CI/CD

Pull requests and pushes to `main`, `test` and `prod` run lint, typechecking, regression tests, a dependency audit and production VSIX packaging through `.github/workflows/ci.yml`. Package contents are explicitly allowlisted so local configuration and credentials are excluded. Dependabot checks npm packages and GitHub Actions weekly.

TypeScript stays on 5.9 because the current TypeScript ESLint parser does not support TypeScript 7. The VS Code type definitions are pinned to the minimum supported API (1.85).

Releases are automated via GitHub Actions (`.github/workflows/release.yml`):

- **Trigger**: PR merged to `test` or `prod` branch
- **test branch**: Creates a prerelease with a `-test` release tag and npm version; the VSIX keeps the numeric extension version and uses the prerelease flag
- **prod branch**: Creates a stable release + publishes to VS Code Marketplace
- Both branches publish to GitHub Packages with an explicit npm dist-tag: `test` for prereleases and `latest` for stable releases. Test publications do not replace the stable `latest` tag.

For a release, update the version in both the manifest and lockfile without creating a Git tag locally:

```bash
npm version minor --no-git-tag-version  # New backwards-compatible feature
```

Use `patch` for a bug-fix release. Update `CHANGELOG.md` and the relevant documentation, then run the checks and package the extension before merging the release PR. The release workflow creates the release tag, packages the VSIX, publishes the scoped npm package and, on `prod`, publishes that same VSIX to the Marketplace using `VSCE_PAT`.
