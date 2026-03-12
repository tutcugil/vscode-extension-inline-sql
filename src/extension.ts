import * as vscode from 'vscode';
import { SqlDecorationProvider } from './highlighting/sqlDecorationProvider';

export function activate(context: vscode.ExtensionContext): void {
  // SQL decoration-based highlighting (works even with semantic tokenization)
  const decorationProvider = new SqlDecorationProvider();
  context.subscriptions.push(decorationProvider);

  // TODO: Register completion provider (Phase 3)
  // TODO: Register diagnostics provider (Phase 4)
  // TODO: Register formatting provider (Phase 5)

  const formatCommand = vscode.commands.registerCommand('inlineSql.formatSql', () => {
    vscode.window.showInformationMessage('Inline SQL: Format command not yet implemented.');
  });

  const refreshCommand = vscode.commands.registerCommand('inlineSql.refreshSchema', () => {
    vscode.window.showInformationMessage('Inline SQL: Schema refresh not yet implemented.');
  });

  context.subscriptions.push(formatCommand, refreshCommand);
}

export function deactivate(): void {
  // Cleanup
}
