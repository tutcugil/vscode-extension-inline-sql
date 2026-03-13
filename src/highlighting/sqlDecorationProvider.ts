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

/**
 * Iteratively find SQL comment spans (avoids ReDoS with block comments).
 * Handles -- line comments and /* block comments *​/.
 */
function findCommentSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < text.length) {
    // Line comment: --
    if (text[i] === '-' && text[i + 1] === '-') {
      const start = i;
      i += 2;
      while (i < text.length && text[i] !== '\n') { i++; }
      spans.push({ start, end: i });
      continue;
    }
    // Block comment: /* ... */
    if (text[i] === '/' && text[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < text.length - 1) {
        if (text[i] === '*' && text[i + 1] === '/') {
          i += 2;
          break;
        }
        i++;
      }
      // If unterminated, treat rest as comment
      if (i >= text.length - 1 && !(text[i - 2] === '*' && text[i - 1] === '/')) {
        i = text.length;
      }
      spans.push({ start, end: i });
      continue;
    }
    i++;
  }
  return spans;
}

export class SqlDecorationProvider implements vscode.Disposable {
  private commentDecorationType: vscode.TextEditorDecorationType;
  private dmlDecorationType: vscode.TextEditorDecorationType;
  private clauseDecorationType: vscode.TextEditorDecorationType;
  private typeDecorationType: vscode.TextEditorDecorationType;
  private functionDecorationType: vscode.TextEditorDecorationType;
  private numericDecorationType: vscode.TextEditorDecorationType;
  private starDecorationType: vscode.TextEditorDecorationType;
  private identifierDecorationType: vscode.TextEditorDecorationType;
  private bracketDecorationType: vscode.TextEditorDecorationType;
  private interpolationDecorationType: vscode.TextEditorDecorationType;
  private punctuationDecorationType: vscode.TextEditorDecorationType;

  private disposables: vscode.Disposable[] = [];
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    // Light: SSMS classic | Dark: soft pastel tones for dark backgrounds
    this.commentDecorationType = vscode.window.createTextEditorDecorationType({
      light: { color: '#008000', fontStyle: 'italic' },
      dark:  { color: '#6A9955', fontStyle: 'italic' },
    });
    this.dmlDecorationType = vscode.window.createTextEditorDecorationType({
      light: { color: '#0000FF', fontWeight: 'bold' },
      dark:  { color: '#569CD6', fontWeight: 'bold' },
    });
    this.clauseDecorationType = vscode.window.createTextEditorDecorationType({
      light: { color: '#0000FF' },
      dark:  { color: '#569CD6' },
    });
    this.typeDecorationType = vscode.window.createTextEditorDecorationType({
      light: { color: '#2E8B57' },
      dark:  { color: '#4EC9B0' },
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
    // Bracket identifiers: [column] brackets — slightly darker than identifier color
    this.bracketDecorationType = vscode.window.createTextEditorDecorationType({
      light: { color: '#444444' },
      dark:  { color: '#7EB8DB' },
    });
    // Interpolation variables: {suffix}, ${expr}, {tempTable} — distinct warm color
    this.interpolationDecorationType = vscode.window.createTextEditorDecorationType({
      light: { color: '#AF6E0E' },
      dark:  { color: '#E5C07B' },
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
    const key = editor.document.uri.toString();
    const existing = this.debounceTimers.get(key);
    if (existing) { clearTimeout(existing); }

    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key);
      // Verify the editor is still active before applying decorations
      if (vscode.window.activeTextEditor === editor) {
        this.updateDecorations(editor);
      }
    }, 200));
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

    const commentRanges: vscode.DecorationOptions[] = [];
    const dmlRanges: vscode.DecorationOptions[] = [];
    const clauseRanges: vscode.DecorationOptions[] = [];
    const typeRanges: vscode.DecorationOptions[] = [];
    const functionRanges: vscode.DecorationOptions[] = [];
    const numericRanges: vscode.DecorationOptions[] = [];
    const starRanges: vscode.DecorationOptions[] = [];
    const identifierRanges: vscode.DecorationOptions[] = [];
    const bracketRanges: vscode.DecorationOptions[] = [];
    const interpolationRanges: vscode.DecorationOptions[] = [];
    const punctuationRanges: vscode.DecorationOptions[] = [];

    const wordPattern = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
    const numericPattern = /\b\d+(\.\d+)?\b/g;
    const starPattern = /\*/g;
    // Punctuation: commas, dots, parens, semicolons, comparison operators, arithmetic
    const punctuationPattern = /[(),;.=<>!+\-/%&|^~@#]/g;
    // Bracket identifiers: [column_name], [dbo], [table] etc.
    const bracketIdentifierPattern = /\[([^\]]+)\]/g;
    for (const region of regions) {
      const regionText = text.slice(region.startOffset, region.endOffset);

      // Find comment ranges using iterative parsing (avoids ReDoS with block comments)
      const commentSpans: Array<{ start: number; end: number }> = [];
      let match: RegExpExecArray | null;
      for (const span of findCommentSpans(regionText)) {
        commentSpans.push(span);
        const startPos = doc.positionAt(region.startOffset + span.start);
        const endPos = doc.positionAt(region.startOffset + span.end);
        commentRanges.push({ range: new vscode.Range(startPos, endPos) });
      }

      // Match bracket identifiers: [column_name] etc.
      const bracketSpans: Array<{ start: number; end: number }> = [];
      for (match of regionText.matchAll(bracketIdentifierPattern)) {
        if (commentSpans.some(c => match!.index >= c.start && match!.index < c.end)) { continue; }
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;
        bracketSpans.push({ start: matchStart, end: matchEnd });

        // Color the opening bracket [
        const openStart = doc.positionAt(region.startOffset + matchStart);
        const openEnd = doc.positionAt(region.startOffset + matchStart + 1);
        bracketRanges.push({ range: new vscode.Range(openStart, openEnd) });

        // Color the content inside brackets as identifier, splitting around interpolations
        const innerContentStart = matchStart + 1;
        const innerContentEnd = matchEnd - 1;
        const innerText = regionText.slice(innerContentStart, innerContentEnd);
        // Find interpolations within bracket content and split identifier ranges
        const innerInterpolations = [...innerText.matchAll(/\$?\{[^}]+\}/g)];
        if (innerInterpolations.length === 0) {
          // No interpolations — color entire content as identifier
          const innerStart = doc.positionAt(region.startOffset + innerContentStart);
          const innerEnd = doc.positionAt(region.startOffset + innerContentEnd);
          identifierRanges.push({ range: new vscode.Range(innerStart, innerEnd) });
        } else {
          // Split around interpolations: color non-interpolation parts as identifier
          let cursor = 0;
          for (const im of innerInterpolations) {
            if (im.index > cursor) {
              const partStart = doc.positionAt(region.startOffset + innerContentStart + cursor);
              const partEnd = doc.positionAt(region.startOffset + innerContentStart + im.index);
              identifierRanges.push({ range: new vscode.Range(partStart, partEnd) });
            }
            cursor = im.index + im[0].length;
          }
          if (cursor < innerText.length) {
            const partStart = doc.positionAt(region.startOffset + innerContentStart + cursor);
            const partEnd = doc.positionAt(region.startOffset + innerContentEnd);
            identifierRanges.push({ range: new vscode.Range(partStart, partEnd) });
          }
        }

        // Color the closing bracket ]
        const closeStart = doc.positionAt(region.startOffset + matchEnd - 1);
        const closeEnd = doc.positionAt(region.startOffset + matchEnd);
        bracketRanges.push({ range: new vscode.Range(closeStart, closeEnd) });
      }

      // Match interpolation variables: {expr}, ${expr}
      // These are host language expressions embedded in SQL strings
      const interpolationPattern = /\$?\{[^}]+\}/g;
      const interpolationSpans: Array<{ start: number; end: number }> = [];
      for (match of regionText.matchAll(interpolationPattern)) {
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;
        // Skip if inside a comment
        if (commentSpans.some(c => matchStart >= c.start && matchStart < c.end)) { continue; }
        // Skip escaped braces {{ }}
        if (matchStart > 0 && regionText[matchStart] === '{' && regionText[matchStart - 1] === '{') { continue; }
        interpolationSpans.push({ start: matchStart, end: matchEnd });
        const startPos = doc.positionAt(region.startOffset + matchStart);
        const endPos = doc.positionAt(region.startOffset + matchEnd);
        interpolationRanges.push({ range: new vscode.Range(startPos, endPos) });
      }

      // Helper: check if an offset falls inside a comment, bracket, or interpolation
      const isInComment = (offset: number): boolean =>
        commentSpans.some(c => offset >= c.start && offset < c.end);
      const isInBracket = (offset: number): boolean =>
        bracketSpans.some(b => offset >= b.start && offset < b.end);
      const isInInterpolation = (offset: number): boolean =>
        interpolationSpans.some(s => offset >= s.start && offset < s.end);

      // Match words
      for (match of regionText.matchAll(wordPattern)) {
        if (isInComment(match.index) || isInBracket(match.index) || isInInterpolation(match.index)) { continue; }

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
      for (match of regionText.matchAll(numericPattern)) {
        if (isInComment(match.index) || isInBracket(match.index) || isInInterpolation(match.index)) { continue; }
        const startPos = doc.positionAt(region.startOffset + match.index);
        const endPos = doc.positionAt(region.startOffset + match.index + match[0].length);
        numericRanges.push({ range: new vscode.Range(startPos, endPos) });
      }

      // Match star
      for (match of regionText.matchAll(starPattern)) {
        if (isInComment(match.index) || isInBracket(match.index) || isInInterpolation(match.index)) { continue; }
        const startPos = doc.positionAt(region.startOffset + match.index);
        const endPos = doc.positionAt(region.startOffset + match.index + 1);
        starRanges.push({ range: new vscode.Range(startPos, endPos) });
      }

      // Match punctuation
      for (match of regionText.matchAll(punctuationPattern)) {
        if (isInComment(match.index) || isInBracket(match.index) || isInInterpolation(match.index)) { continue; }
        const startPos = doc.positionAt(region.startOffset + match.index);
        const endPos = doc.positionAt(region.startOffset + match.index + 1);
        punctuationRanges.push({ range: new vscode.Range(startPos, endPos) });
      }
    }

    editor.setDecorations(this.commentDecorationType, commentRanges);
    editor.setDecorations(this.dmlDecorationType, dmlRanges);
    editor.setDecorations(this.clauseDecorationType, clauseRanges);
    editor.setDecorations(this.typeDecorationType, typeRanges);
    editor.setDecorations(this.functionDecorationType, functionRanges);
    editor.setDecorations(this.numericDecorationType, numericRanges);
    editor.setDecorations(this.starDecorationType, starRanges);
    editor.setDecorations(this.identifierDecorationType, identifierRanges);
    editor.setDecorations(this.bracketDecorationType, bracketRanges);
    editor.setDecorations(this.interpolationDecorationType, interpolationRanges);
    editor.setDecorations(this.punctuationDecorationType, punctuationRanges);
  }

  private clearDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.commentDecorationType, []);
    editor.setDecorations(this.dmlDecorationType, []);
    editor.setDecorations(this.clauseDecorationType, []);
    editor.setDecorations(this.typeDecorationType, []);
    editor.setDecorations(this.functionDecorationType, []);
    editor.setDecorations(this.numericDecorationType, []);
    editor.setDecorations(this.starDecorationType, []);
    editor.setDecorations(this.identifierDecorationType, []);
    editor.setDecorations(this.bracketDecorationType, []);
    editor.setDecorations(this.interpolationDecorationType, []);
    editor.setDecorations(this.punctuationDecorationType, []);
  }

  dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.commentDecorationType.dispose();
    this.dmlDecorationType.dispose();
    this.clauseDecorationType.dispose();
    this.typeDecorationType.dispose();
    this.functionDecorationType.dispose();
    this.numericDecorationType.dispose();
    this.starDecorationType.dispose();
    this.identifierDecorationType.dispose();
    this.bracketDecorationType.dispose();
    this.interpolationDecorationType.dispose();
    this.punctuationDecorationType.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
