import * as vscode from 'vscode';
import { detectSqlRegions, findSqlRegionAtOffset } from '../detection/sqlDetector';
import { SqlRegion } from '../types';

// sql-formatter is a bundled dependency
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { format } = require('sql-formatter');

export class SqlFormattingProvider implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor() {
    // No event listeners needed — formatting is triggered on-demand
  }

  /**
   * Format the SQL region under the cursor.
   * Called from the `inlineSql.formatSql` command.
   */
  async formatSqlAtCursor(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Inline SQL: No active editor.');
      return;
    }

    const document = editor.document;
    const text = document.getText();
    const cursorOffset = document.offsetAt(editor.selection.active);

    const regions = detectSqlRegions(text, document.languageId);
    const region = findSqlRegionAtOffset(regions, cursorOffset);
    if (!region) {
      vscode.window.showInformationMessage('Inline SQL: Cursor is not inside a SQL string.');
      return;
    }

    const formatted = this.formatRegion(document, region);
    if (!formatted) { return; }

    const regionRange = new vscode.Range(
      document.positionAt(region.startOffset),
      document.positionAt(region.endOffset),
    );

    await editor.edit(editBuilder => {
      editBuilder.replace(regionRange, formatted);
    });
  }

  /**
   * Format all SQL regions in the active document.
   */
  async formatAllSqlInDocument(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const document = editor.document;
    const text = document.getText();
    const regions = detectSqlRegions(text, document.languageId);

    if (regions.length === 0) {
      vscode.window.showInformationMessage('Inline SQL: No SQL regions found.');
      return;
    }

    // Apply edits in reverse order to preserve offsets
    const sortedRegions = [...regions].sort((a, b) => b.startOffset - a.startOffset);

    await editor.edit(editBuilder => {
      for (const region of sortedRegions) {
        const formatted = this.formatRegion(document, region);
        if (formatted) {
          const range = new vscode.Range(
            document.positionAt(region.startOffset),
            document.positionAt(region.endOffset),
          );
          editBuilder.replace(range, formatted);
        }
      }
    });

    vscode.window.showInformationMessage(`Inline SQL: Formatted ${regions.length} SQL region(s).`);
  }

  private formatRegion(document: vscode.TextDocument, region: SqlRegion): string | undefined {
    const config = vscode.workspace.getConfiguration('inlineSql');
    const indent = config.get<number>('formatting.indent', 4);
    const uppercase = config.get<boolean>('formatting.uppercase', true);
    const dialect = config.get<string>('formatting.dialect', 'sql');

    try {
      let formatted: string = format(region.sqlText, {
        language: dialect,
        tabWidth: indent,
        keywordCase: uppercase ? 'upper' : 'preserve',
      });

      // Calculate the base indentation from the string's starting line
      const startPos = document.positionAt(region.startOffset);
      const lineText = document.lineAt(startPos.line).text;
      const baseIndent = lineText.match(/^\s*/)?.[0] || '';
      // Add extra indent for the SQL content inside the string
      const contentIndent = baseIndent + ' '.repeat(indent);

      // Re-indent: first line stays inline, subsequent lines get base indent
      const lines = formatted.split('\n');
      if (lines.length > 1) {
        formatted = lines[0] + '\n' + lines.slice(1).map(line => {
          const trimmed = line.trimStart();
          return trimmed ? contentIndent + trimmed : '';
        }).join('\n');
      }

      return formatted;
    } catch {
      vscode.window.showWarningMessage('Inline SQL: Failed to format SQL.');
      return undefined;
    }
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}
