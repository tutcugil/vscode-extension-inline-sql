# Changelog

## 0.2.0

### Added

- Adopt the blue-and-orange folded ribbon (Akış) as the extension icon.
- Read formatting preferences from the nearest `.sql-formatter.json` within the document's workspace folder. File options override VS Code settings, and saved changes apply on the next formatting command.
- Support shared SQL dialect, casing, indentation, tab and layout options while preserving host-language interpolation expressions.
- Resolve configuration independently for each workspace folder and through the VS Code filesystem for remote workspaces.
- Document configuration precedence, supported options, troubleshooting and release preparation.

### Fixed

- Publish test npm packages with the explicit `test` dist-tag and stable packages with `latest`, fixing prerelease publication failures.
- Report invalid configuration without editing source code, and cancel formatting if the document changes during configuration loading.
- Preserve interpolation expressions and valid host string syntax when formatting; leave unsupported escape sequences, multiline SQL values and single-line raw strings unchanged.
- Handle nested template expressions, Python f-string expressions and C# raw string delimiters more accurately.
- Restore completion at the end of SQL strings and refresh expired schema metadata on demand.
- Discard stale schema requests after connection changes and keep same-named tables in separate database schemas.

### Security and maintenance

- Restrict database driver loading to trusted workspaces, read connections from User settings and support passwords through environment variables.
- Prevent driver errors from exposing credentials in messages and exclude local configuration files from published packages.
- Update dependencies, migrate ESLint configuration, add CI checks and automate dependency update checks.
