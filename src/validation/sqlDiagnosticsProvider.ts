import * as vscode from 'vscode';
import { detectSqlRegions } from '../detection/sqlDetector';
import { SqlRegion } from '../types';

// node-sql-parser is a bundled dependency
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Parser } = require('node-sql-parser');

const DIALECT_MAP: Record<string, string> = {
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  transactsql: 'TransactSQL',
  sqlite: 'SQLite',
};

/** Map host language to the most likely SQL dialect */
const LANGUAGE_DIALECT_MAP: Record<string, string> = {
  csharp: 'TransactSQL',
  java: 'MySQL',
  python: 'MySQL',
  typescript: 'MySQL',
  javascript: 'MySQL',
  typescriptreact: 'MySQL',
  javascriptreact: 'MySQL',
};

/**
 * SQL statements/commands that node-sql-parser often can't parse
 * but are valid SQL. Skip validation for these to avoid false positives.
 */
const SKIP_VALIDATION_PATTERN = /^\s*(?:SET\s+|BEGIN\s+|COMMIT|ROLLBACK|IF\s+|PRINT\s+|RAISERROR|THROW\s+|USE\s+|GO\b|EXEC(?:UTE)?\s+|DECLARE\s+)/i;

/**
 * SQL clause fragments that are valid parts of larger statements
 * but cannot be parsed standalone (e.g. used with StringBuilder).
 */
const SQL_FRAGMENT_PATTERN = /^\s*(?:UNION\s+ALL|UNION|ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT|OFFSET|AND\s+|OR\s+|ON\s+|ELSE|END)\b/i;

const SUPPORTED_LANGUAGES = [
  'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
  'python', 'java', 'csharp',
];

export class SqlDiagnosticsProvider implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private parser = new Parser();

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('inlineSql');

    this.disposables.push(
      this.diagnosticCollection,
      vscode.workspace.onDidChangeTextDocument(event => {
        if (this.isEnabled() && SUPPORTED_LANGUAGES.includes(event.document.languageId)) {
          this.scheduleValidation(event.document);
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && this.isEnabled() && SUPPORTED_LANGUAGES.includes(editor.document.languageId)) {
          this.validateDocument(editor.document);
        }
      }),
      vscode.workspace.onDidCloseTextDocument(doc => {
        this.diagnosticCollection.delete(doc.uri);
        const key = doc.uri.toString();
        const existing = this.debounceTimers.get(key);
        if (existing) { clearTimeout(existing); }
        this.debounceTimers.delete(key);
      }),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('inlineSql.validation')) {
          if (this.isEnabled()) {
            // Re-validate all open editors
            for (const editor of vscode.window.visibleTextEditors) {
              if (SUPPORTED_LANGUAGES.includes(editor.document.languageId)) {
                this.validateDocument(editor.document);
              }
            }
          } else {
            this.diagnosticCollection.clear();
          }
        }
      }),
    );

    // Validate current editor on activation
    if (vscode.window.activeTextEditor) {
      const doc = vscode.window.activeTextEditor.document;
      if (this.isEnabled() && SUPPORTED_LANGUAGES.includes(doc.languageId)) {
        this.validateDocument(doc);
      }
    }
  }

  private isEnabled(): boolean {
    return vscode.workspace.getConfiguration('inlineSql').get<boolean>('validation.enabled', true);
  }

  private getDialect(languageId?: string): string {
    const dialect = vscode.workspace.getConfiguration('inlineSql').get<string>('validation.dialect', 'auto');
    if (dialect === 'auto') {
      return (languageId && LANGUAGE_DIALECT_MAP[languageId]) || 'MySQL';
    }
    return DIALECT_MAP[dialect] || 'MySQL';
  }

  private scheduleValidation(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const existing = this.debounceTimers.get(key);
    if (existing) { clearTimeout(existing); }

    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key);
      this.validateDocument(document);
    }, 300));
  }

  private validateDocument(document: vscode.TextDocument): void {
    if (!this.isEnabled()) {
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    const text = document.getText();
    const regions = detectSqlRegions(text, document.languageId);
    const diagnostics: vscode.Diagnostic[] = [];
    const dialect = this.getDialect(document.languageId);

    for (const region of regions) {
      const diag = this.validateRegion(document, region, dialect);
      if (diag) { diagnostics.push(diag); }
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  private validateRegion(
    document: vscode.TextDocument,
    region: SqlRegion,
    dialect: string,
  ): vscode.Diagnostic | undefined {
    const sql = region.sqlText.trim();
    if (!sql) { return undefined; }

    // Skip validation for known SQL commands that parsers often don't support
    if (SKIP_VALIDATION_PATTERN.test(sql)) {
      return undefined;
    }

    // Skip SQL clause fragments (used in StringBuilder concatenation patterns)
    if (SQL_FRAGMENT_PATTERN.test(sql)) {
      return undefined;
    }

    // Normalize placeholders inside bracket identifiers:
    // [QUEUE_MESSAGE_@__p___PROCESSING] → [QUEUE_MESSAGE_X_PROCESSING]
    const normalizedSql = sql.replace(/\[([^\]]*@__p__[^\]]*)\]/g, (_match, inner: string) => {
      return '[' + inner.replace(/@__p__/g, 'X') + ']';
    });

    // Calculate how many leading chars were trimmed so we can adjust offsets
    const leadingTrimmed = region.sqlText.length - region.sqlText.trimStart().length;

    try {
      this.parser.astify(normalizedSql, { database: dialect });
      return undefined; // Valid SQL
    } catch (err: unknown) {
      const error = err as { message?: string; location?: { start?: { offset?: number; line?: number; column?: number } } };
      const message = error.message || 'SQL syntax error';

      // Try to map error position back to document
      let range: vscode.Range;
      if (error.location?.start) {
        const errorOffset = region.startOffset + leadingTrimmed + (error.location.start.offset || 0);
        const startPos = document.positionAt(errorOffset);
        // Highlight from error position to end of word or a few chars
        const endOffset = Math.min(errorOffset + 10, region.endOffset);
        const endPos = document.positionAt(endOffset);
        range = new vscode.Range(startPos, endPos);
      } else {
        // Fallback: highlight the entire SQL region
        range = new vscode.Range(
          document.positionAt(region.startOffset),
          document.positionAt(region.endOffset),
        );
      }

      // Clean up the error message (remove parser internals)
      const cleanMessage = this.cleanErrorMessage(message);

      const diagnostic = new vscode.Diagnostic(range, `SQL: ${cleanMessage}`, vscode.DiagnosticSeverity.Warning);
      diagnostic.source = 'Inline SQL';
      return diagnostic;
    }
  }

  private cleanErrorMessage(message: string): string {
    // node-sql-parser messages can be verbose; trim to the useful part
    const match = message.match(/Expected (.+?) but (.+?) found/);
    if (match) {
      return `Expected ${match[1]} but ${match[2]} found`;
    }
    // Trim very long messages
    if (message.length > 120) {
      return message.slice(0, 117) + '...';
    }
    return message;
  }

  dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.disposables.forEach(d => d.dispose());
  }
}
