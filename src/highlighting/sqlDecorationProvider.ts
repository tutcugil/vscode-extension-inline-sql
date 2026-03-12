import * as vscode from 'vscode';
import { detectSqlRegions } from '../detection/sqlDetector';
import { SQL_STATEMENT_KEYWORDS, SQL_CLAUSE_KEYWORDS } from '../detection/patterns';

// Build keyword sets for categorized highlighting
const DML_KEYWORDS = new Set(SQL_STATEMENT_KEYWORDS.map(k => k.toUpperCase()));
const CLAUSE_KEYWORDS = new Set(SQL_CLAUSE_KEYWORDS.map(k => k.toUpperCase()));

const TYPE_KEYWORDS = new Set([
  'VARCHAR', 'CHAR', 'NVARCHAR', 'NCHAR', 'TEXT', 'NTEXT',
  'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT',
  'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'REAL', 'MONEY', 'SMALLMONEY',
  'BOOLEAN', 'BOOL', 'BIT',
  'DATE', 'TIME', 'TIMESTAMP', 'DATETIME', 'DATETIME2', 'SMALLDATETIME', 'DATETIMEOFFSET',
  'BLOB', 'CLOB', 'BINARY', 'VARBINARY', 'IMAGE',
  'XML', 'JSON', 'JSONB', 'UUID', 'UNIQUEIDENTIFIER',
  'SERIAL', 'BIGSERIAL', 'SMALLSERIAL',
]);

const FUNCTION_KEYWORDS = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'COALESCE', 'NULLIF', 'CAST', 'CONVERT', 'ISNULL', 'IFNULL', 'NVL',
  'CONCAT', 'SUBSTRING', 'TRIM', 'LTRIM', 'RTRIM', 'UPPER', 'LOWER',
  'LENGTH', 'LEN', 'REPLACE', 'REVERSE',
  'NOW', 'CURRENT_TIMESTAMP', 'GETDATE', 'DATEADD', 'DATEDIFF',
  'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND',
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE', 'LAG', 'LEAD',
  'FIRST_VALUE', 'LAST_VALUE',
  'ABS', 'CEILING', 'FLOOR', 'ROUND', 'SIGN', 'POWER', 'SQRT',
  'FORMAT', 'STRING_AGG',
]);

export class SqlDecorationProvider implements vscode.Disposable {
  private dmlDecorationType: vscode.TextEditorDecorationType;
  private clauseDecorationType: vscode.TextEditorDecorationType;
  private typeDecorationType: vscode.TextEditorDecorationType;
  private functionDecorationType: vscode.TextEditorDecorationType;
  private numericDecorationType: vscode.TextEditorDecorationType;
  private starDecorationType: vscode.TextEditorDecorationType;
  private identifierDecorationType: vscode.TextEditorDecorationType;
  private punctuationDecorationType: vscode.TextEditorDecorationType;

  private disposables: vscode.Disposable[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Light: SSMS classic | Dark: soft pastel tones for dark backgrounds
    this.dmlDecorationType = vscode.window.createTextEditorDecorationType({
      light: { color: '#0000FF', fontWeight: 'bold' },
      dark:  { color: '#569CD6', fontWeight: 'bold' },
    });
    this.clauseDecorationType = vscode.window.createTextEditorDecorationType({
      light: { color: '#0000FF' },
      dark:  { color: '#569CD6' },
    });
    this.typeDecorationType = vscode.window.createTextEditorDecorationType({
      light: { color: '#2E8B57', fontStyle: 'italic' },
      dark:  { color: '#4EC9B0', fontStyle: 'italic' },
    });
    this.functionDecorationType = vscode.window.createTextEditorDecorationType({
      light: { color: '#FF00FF' },
      dark:  { color: '#DCDCAA' },
    });
    this.numericDecorationType = vscode.window.createTextEditorDecorationType({
      light: { color: '#FF0000' },
      dark:  { color: '#B5CEA8' },
    });
    this.starDecorationType = vscode.window.createTextEditorDecorationType({
      light: { color: '#808080' },
      dark:  { color: '#D4D4D4' },
    });
    // Identifiers: table names, column names, aliases
    this.identifierDecorationType = vscode.window.createTextEditorDecorationType({
      light: { color: '#111111' },
      dark:  { color: '#9CDCFE' },
    });
    // Punctuation: commas, dots, parens, operators like = < > etc.
    this.punctuationDecorationType = vscode.window.createTextEditorDecorationType({
      light: { color: '#555555' },
      dark:  { color: '#CCCCCC' },
    });

    // Listen to editor events
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) { this.updateDecorations(editor); }
      }),
      vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
          this.scheduleUpdate(editor);
        }
      }),
    );

    // Decorate current editor
    if (vscode.window.activeTextEditor) {
      this.updateDecorations(vscode.window.activeTextEditor);
    }
  }

  private scheduleUpdate(editor: vscode.TextEditor): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => this.updateDecorations(editor), 200);
  }

  private updateDecorations(editor: vscode.TextEditor): void {
    const doc = editor.document;
    const languageId = doc.languageId;

    const supportedLanguages = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact', 'python', 'java', 'csharp'];
    if (!supportedLanguages.includes(languageId)) {
      this.clearDecorations(editor);
      return;
    }

    const text = doc.getText();
    const regions = detectSqlRegions(text, languageId);

    const dmlRanges: vscode.DecorationOptions[] = [];
    const clauseRanges: vscode.DecorationOptions[] = [];
    const typeRanges: vscode.DecorationOptions[] = [];
    const functionRanges: vscode.DecorationOptions[] = [];
    const numericRanges: vscode.DecorationOptions[] = [];
    const starRanges: vscode.DecorationOptions[] = [];
    const identifierRanges: vscode.DecorationOptions[] = [];
    const punctuationRanges: vscode.DecorationOptions[] = [];

    const wordPattern = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
    const numericPattern = /\b\d+(\.\d+)?\b/g;
    const starPattern = /\*/g;
    // Punctuation: commas, dots, parens, semicolons, comparison operators, arithmetic
    const punctuationPattern = /[(),;.=<>!+\-/%&|^~@#]/g;

    for (const region of regions) {
      const regionText = text.slice(region.startOffset, region.endOffset);

      // Match words
      let match: RegExpExecArray | null;
      wordPattern.lastIndex = 0;
      while ((match = wordPattern.exec(regionText)) !== null) {
        const word = match[0].toUpperCase();
        const startPos = doc.positionAt(region.startOffset + match.index);
        const endPos = doc.positionAt(region.startOffset + match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);

        if (DML_KEYWORDS.has(word)) {
          dmlRanges.push({ range });
        } else if (CLAUSE_KEYWORDS.has(word)) {
          clauseRanges.push({ range });
        } else if (TYPE_KEYWORDS.has(word)) {
          typeRanges.push({ range });
        } else if (FUNCTION_KEYWORDS.has(word)) {
          const afterWord = regionText.slice(match.index + match[0].length).trimStart();
          if (afterWord.startsWith('(')) {
            functionRanges.push({ range });
          } else {
            identifierRanges.push({ range });
          }
        } else {
          // Table names, column names, aliases, etc.
          identifierRanges.push({ range });
        }
      }

      // Match numbers
      numericPattern.lastIndex = 0;
      while ((match = numericPattern.exec(regionText)) !== null) {
        const startPos = doc.positionAt(region.startOffset + match.index);
        const endPos = doc.positionAt(region.startOffset + match.index + match[0].length);
        numericRanges.push({ range: new vscode.Range(startPos, endPos) });
      }

      // Match star
      starPattern.lastIndex = 0;
      while ((match = starPattern.exec(regionText)) !== null) {
        const startPos = doc.positionAt(region.startOffset + match.index);
        const endPos = doc.positionAt(region.startOffset + match.index + 1);
        starRanges.push({ range: new vscode.Range(startPos, endPos) });
      }

      // Match punctuation
      punctuationPattern.lastIndex = 0;
      while ((match = punctuationPattern.exec(regionText)) !== null) {
        const startPos = doc.positionAt(region.startOffset + match.index);
        const endPos = doc.positionAt(region.startOffset + match.index + 1);
        punctuationRanges.push({ range: new vscode.Range(startPos, endPos) });
      }
    }

    editor.setDecorations(this.dmlDecorationType, dmlRanges);
    editor.setDecorations(this.clauseDecorationType, clauseRanges);
    editor.setDecorations(this.typeDecorationType, typeRanges);
    editor.setDecorations(this.functionDecorationType, functionRanges);
    editor.setDecorations(this.numericDecorationType, numericRanges);
    editor.setDecorations(this.starDecorationType, starRanges);
    editor.setDecorations(this.identifierDecorationType, identifierRanges);
    editor.setDecorations(this.punctuationDecorationType, punctuationRanges);
  }

  private clearDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.dmlDecorationType, []);
    editor.setDecorations(this.clauseDecorationType, []);
    editor.setDecorations(this.typeDecorationType, []);
    editor.setDecorations(this.functionDecorationType, []);
    editor.setDecorations(this.numericDecorationType, []);
    editor.setDecorations(this.starDecorationType, []);
    editor.setDecorations(this.identifierDecorationType, []);
    editor.setDecorations(this.punctuationDecorationType, []);
  }

  dispose(): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
    this.dmlDecorationType.dispose();
    this.clauseDecorationType.dispose();
    this.typeDecorationType.dispose();
    this.functionDecorationType.dispose();
    this.numericDecorationType.dispose();
    this.starDecorationType.dispose();
    this.identifierDecorationType.dispose();
    this.punctuationDecorationType.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
