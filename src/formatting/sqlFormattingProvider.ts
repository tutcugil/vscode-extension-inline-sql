import * as vscode from 'vscode';
import { findSqlRegionAtOffset } from '../detection/sqlDetector';
import { documentSqlRegions } from '../configuration';
import { SqlRegion } from '../types';

import { formatLiteral } from './formatLiteral';
import { resolveFormatterOptions } from './formatterConfiguration';
import { SqlFormatOptions } from './formatOptions';

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
    const version = document.version;
    const cursorOffset = document.offsetAt(editor.selection.active);

    const regions = documentSqlRegions(document);
    const region = findSqlRegionAtOffset(regions, cursorOffset);
    if (!region) {
      vscode.window.showInformationMessage('Inline SQL: Cursor is not inside a SQL string.');
      return;
    }

    const options = await this.loadOptions(document);
    if (!options || !this.isCurrent(document, version)) { return; }
    const formatted = this.formatRegion(document, region, options);
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
    const version = document.version;
    const regions = documentSqlRegions(document);

    if (regions.length === 0) {
      vscode.window.showInformationMessage('Inline SQL: No SQL regions found.');
      return;
    }

    const options = await this.loadOptions(document);
    if (!options || !this.isCurrent(document, version)) { return; }

    // Apply edits in reverse order to preserve offsets
    const sortedRegions = [...regions].sort((a, b) => b.startOffset - a.startOffset);
    let formattedCount = 0;

    const applied = await editor.edit(editBuilder => {
      for (const region of sortedRegions) {
        const formatted = this.formatRegion(document, region, options);
        if (formatted) {
          const range = new vscode.Range(
            document.positionAt(region.startOffset),
            document.positionAt(region.endOffset),
          );
          editBuilder.replace(range, formatted);
          formattedCount++;
        }
      }
    });

    if (applied) { vscode.window.showInformationMessage(`Inline SQL: Formatted ${formattedCount} SQL region(s).`); }
  }

  private async loadOptions(document: vscode.TextDocument): Promise<SqlFormatOptions | undefined> {
    try {
      return await resolveFormatterOptions(document);
    } catch (error) {
      vscode.window.showWarningMessage(`Inline SQL: Invalid formatter configuration — ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private isCurrent(document: vscode.TextDocument, version: number): boolean {
    if (document.isClosed || document.version !== version) {
      vscode.window.showInformationMessage('Inline SQL: Document changed while reading formatter configuration. Run formatting again.');
      return false;
    }
    return true;
  }

  private formatRegion(document: vscode.TextDocument, region: SqlRegion, options: SqlFormatOptions): string | undefined {
    try {
      if (!region.literal) { return undefined; }
      const startPos = document.positionAt(region.startOffset);
      const baseIndent = document.lineAt(startPos.line).text.match(/^[\t ]*/)?.[0] || '';
      return formatLiteral(region.literal, document.languageId, options, baseIndent);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('Inline SQL: format error:', detail);
      vscode.window.showWarningMessage(`Inline SQL: Failed to format SQL — ${detail}`);
      return undefined;
    }
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}
