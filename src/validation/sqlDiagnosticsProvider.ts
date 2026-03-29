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
 * Individual SQL statements/commands that node-sql-parser can't parse
 * but are valid SQL. These are skipped when splitting multi-statement blocks.
 */
const SKIP_STATEMENT_PATTERN = /^\s*(?:SET\s+|BEGIN\s+|COMMIT|ROLLBACK|IF\s+|PRINT\s+|RAISERROR|THROW\s+|USE\s+|GO\b|EXEC(?:UTE)?\s+|DECLARE\s+|DROP\s+|END\b)/i;

/**
 * Detects whether a SQL string is a multi-statement T-SQL block
 * (starts with SET, BEGIN, DECLARE, etc.) that needs to be split.
 */
const MULTI_STATEMENT_PATTERN = /^\s*(?:SET\s+|BEGIN\s+|DECLARE\s+)/i;

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
      const diags = this.validateRegion(document, region, dialect);
      diagnostics.push(...diags);
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  /**
   * Normalize SQL text to make it more parser-friendly.
   * Dialect-aware: TransactSQL keeps bracket identifiers, others convert to backticks.
   */
  private normalizeSql(sql: string, dialect: string): string {
    let s = sql;

    // Normalize placeholders inside bracket identifiers:
    // [QUEUE_MESSAGE_@__p___PROCESSING] → [QUEUE_MESSAGE_X_PROCESSING]
    s = s.replace(/\[([^\]]*(?:@__p__|__P__)[^\]]*)\]/g, (_match, inner: string) => {
      return '[' + inner.replace(/@__p__|__P__/g, 'X') + ']';
    });

    // Replace standalone @__p__ or __P__ in SELECT column position with a literal 1
    // e.g. "SELECT {MessageColumns}" → "SELECT @__p__" → "SELECT 1"
    s = s.replace(/(?<=SELECT\s+)@__p__|__P__/gi, '1');

    // Normalize bracket identifiers for non-TransactSQL dialects only.
    // TransactSQL (SQL Server) supports [bracket] identifiers natively in node-sql-parser;
    // converting to backticks breaks TransactSQL parsing.
    if (dialect !== 'TransactSQL') {
      s = s.replace(/\[([^\]]+)\]/g, '`$1`');
    }

    // Replace NEXT VALUE FOR <sequence> with a literal (T-SQL sequence syntax, unsupported by parser)
    s = s.replace(/\bNEXT\s+VALUE\s+FOR\s+[\w.\[\]]+/gi, '1');

    // Normalize temp table names: #TMP_CLAIMED → TMP_CLAIMED
    s = s.replace(/#(\w+)/g, '$1');

    // Normalize table variables: FROM @ids → FROM ids
    s = s.replace(/(?<=\bFROM\s+)@(\w+)/gi, '$1');

    // Remove OUTPUT ... INTO ... clause (T-SQL specific, not supported by parser)
    // Supports dotted names (db.schema.table), bracket-quoted ([dbo].[Table]), table variables (@var),
    // and optional column list — e.g. OUTPUT deleted.* INTO @tmp (col1, col2) or OUTPUT inserted.id INTO @ids
    s = s.replace(/\bOUTPUT\s+[\s\S]*?\bINTO\s+@?[\w.\[\]]+\s*(?:\([^)]*\))?\s*/gi, '');

    // Remove table hint after DELETE/UPDATE alias: "DELETE TOP (n) q WITH (READPAST)" → "DELETE TOP (n) q"
    // node-sql-parser can't parse alias+hint before FROM with 3-part table names
    s = s.replace(/\b(DELETE\s+(?:TOP\s*\([^)]*\)\s*)?\w+)\s+WITH\s*\([^)]*\)/gi, '$1');
    s = s.replace(/\b(UPDATE\s+\w+)\s+WITH\s*\([^)]*\)/gi, '$1');

    // Replace placeholders in table positions with valid table name
    // e.g. INNER JOIN @__p__ → INNER JOIN _T_, FROM __P__ → FROM _T_
    s = s.replace(/(?<=\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+)(?:@__p__|__P__)/gi, '_T_');

    // Replace remaining @param / placeholder references with literals for parser compatibility
    // e.g. @node → 1, @nodeChecksum → 1, __P__ → 1 (keeps SQL structurally valid)
    s = s.replace(/@__p__|__P__/g, '1');
    s = s.replace(/@\w+/g, '1');

    // Replace single pipe (bitwise OR) with + for parser compatibility
    // but keep || (string concatenation) intact
    s = s.replace(/(?<!\|)\|(?!\|)/g, '+');

    // Remove trailing semicolons that some dialects don't like
    s = s.replace(/;\s*$/, '');

    return s;
  }

  /**
   * T-SQL statement-start keywords for boundary detection when semicolons are absent.
   * Only includes keywords that unambiguously start a new statement.
   * SELECT is excluded because it commonly appears as part of INSERT...SELECT.
   */
  private static readonly STMT_BOUNDARY = /(?<=\n)\s*(?=(?:INSERT|UPDATE|DELETE|DECLARE|BEGIN|COMMIT|ROLLBACK|IF|END|EXEC(?:UTE)?|DROP|CREATE|ALTER|MERGE|TRUNCATE|PRINT|RAISERROR|THROW|USE|GO)\b)/i;

  /**
   * Split a multi-statement T-SQL block into individual statements.
   * Uses semicolons as primary delimiter, then falls back to newline+keyword boundaries.
   */
  private splitStatements(sql: string): Array<{ sql: string; offset: number }> {
    const results: Array<{ sql: string; offset: number }> = [];
    let current = '';
    let currentStart = 0;

    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];

      // Skip string literals
      if (ch === '\'') {
        current += ch;
        i++;
        while (i < sql.length) {
          current += sql[i];
          if (sql[i] === '\'' && sql[i + 1] !== '\'') { break; }
          if (sql[i] === '\'' && sql[i + 1] === '\'') { current += sql[++i]; }
          i++;
        }
        continue;
      }

      if (ch === ';') {
        const trimmed = current.trim();
        if (trimmed) {
          results.push({ sql: trimmed, offset: currentStart });
        }
        current = '';
        currentStart = i + 1;
        continue;
      }

      if (!current.trim() && /\s/.test(ch)) {
        currentStart = i + 1;
      }

      current += ch;
    }

    const trimmed = current.trim();
    if (trimmed) {
      results.push({ sql: trimmed, offset: currentStart });
    }

    // Second pass: split any remaining multi-statement chunks at newline+keyword boundaries
    const refined: Array<{ sql: string; offset: number }> = [];
    for (const entry of results) {
      const parts = entry.sql.split(SqlDiagnosticsProvider.STMT_BOUNDARY);
      let offset = entry.offset;
      for (const part of parts) {
        const t = part.trim();
        if (t) {
          refined.push({ sql: t, offset: offset + entry.sql.indexOf(t, offset - entry.offset) });
        }
        offset += part.length;
      }
    }

    return refined;
  }

  private validateRegion(
    document: vscode.TextDocument,
    region: SqlRegion,
    dialect: string,
  ): vscode.Diagnostic[] {
    const sql = region.sqlText.trim();
    if (!sql) { return []; }

    // Skip SQL clause fragments (used in StringBuilder concatenation patterns)
    if (SQL_FRAGMENT_PATTERN.test(sql)) {
      return [];
    }

    // Multi-statement T-SQL blocks: split into statements, validate DML ones individually
    if (MULTI_STATEMENT_PATTERN.test(sql)) {
      const statements = this.splitStatements(sql);
      const diagnostics: vscode.Diagnostic[] = [];

      for (const stmt of statements) {
        // Skip procedural statements the parser can't handle
        if (SKIP_STATEMENT_PATTERN.test(stmt.sql)) { continue; }
        // Skip fragments
        if (SQL_FRAGMENT_PATTERN.test(stmt.sql)) { continue; }

        const stmtOffset = region.startOffset + (region.sqlText.length - region.sqlText.trimStart().length) + stmt.offset;

        const diag = this.validateSingleStatement(document, stmt.sql, stmtOffset, region, dialect);
        if (diag) { diagnostics.push(diag); }
      }

      return diagnostics;
    }

    // Single-statement: skip procedural commands
    if (SKIP_STATEMENT_PATTERN.test(sql)) {
      return [];
    }

    const leadingTrimmed = region.sqlText.length - region.sqlText.trimStart().length;
    const diag = this.validateSingleStatement(document, sql, region.startOffset + leadingTrimmed, region, dialect);
    return diag ? [diag] : [];
  }

  private validateSingleStatement(
    document: vscode.TextDocument,
    sql: string,
    sqlDocOffset: number,
    region: SqlRegion,
    dialect: string,
  ): vscode.Diagnostic | undefined {
    const normalizedSql = this.normalizeSql(sql, dialect);

    try {
      this.parser.astify(normalizedSql, { database: dialect });
      return undefined;
    } catch (err: unknown) {
      const error = err as { message?: string; location?: { start?: { offset?: number; line?: number; column?: number } } };
      const message = error.message || 'SQL syntax error';

      let range: vscode.Range;
      if (error.location?.start) {
        const rawOffset = sqlDocOffset + (error.location.start.offset || 0);
        const errorOffset = Math.max(region.startOffset, Math.min(rawOffset, region.endOffset - 1));
        const startPos = document.positionAt(errorOffset);
        const endOffset = Math.min(errorOffset + 10, region.endOffset);
        const endPos = document.positionAt(endOffset);
        range = new vscode.Range(startPos, endPos);
      } else {
        const startPos = document.positionAt(sqlDocOffset);
        const endOffset = Math.min(sqlDocOffset + sql.length, region.endOffset);
        const endPos = document.positionAt(endOffset);
        range = new vscode.Range(startPos, endPos);
      }

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
