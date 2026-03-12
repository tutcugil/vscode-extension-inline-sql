import * as vscode from 'vscode';
import { SqlDecorationProvider } from './highlighting/sqlDecorationProvider';
import { SqlCompletionProvider } from './completion/sqlCompletionProvider';
import { ConnectionManager } from './db/connectionManager';
import { SqlDiagnosticsProvider } from './validation/sqlDiagnosticsProvider';
import { SqlFormattingProvider } from './formatting/sqlFormattingProvider';

const SUPPORTED_LANGUAGES = [
  'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
  'python', 'java', 'csharp',
];

export function activate(context: vscode.ExtensionContext): void {
  // SQL decoration-based highlighting (works even with semantic tokenization)
  const decorationProvider = new SqlDecorationProvider();
  context.subscriptions.push(decorationProvider);

  // Database connection manager (for schema-aware autocomplete)
  const connectionManager = new ConnectionManager();
  context.subscriptions.push(connectionManager);

  // SQL autocomplete
  const completionProvider = new SqlCompletionProvider(
    () => connectionManager.getSchemaSync()
  );
  const completionDisposable = vscode.languages.registerCompletionItemProvider(
    SUPPORTED_LANGUAGES.map(lang => ({ language: lang })),
    completionProvider,
    '.', ' '  // Trigger on dot (table.column) and space (after keywords)
  );
  context.subscriptions.push(completionDisposable);

  // SQL validation/linting
  const diagnosticsProvider = new SqlDiagnosticsProvider();
  context.subscriptions.push(diagnosticsProvider);

  // SQL formatting
  const formattingProvider = new SqlFormattingProvider();
  context.subscriptions.push(formattingProvider);

  // Commands
  const formatCommand = vscode.commands.registerCommand('inlineSql.formatSql', () => {
    formattingProvider.formatSqlAtCursor();
  });

  const formatAllCommand = vscode.commands.registerCommand('inlineSql.formatAllSql', () => {
    formattingProvider.formatAllSqlInDocument();
  });

  const refreshCommand = vscode.commands.registerCommand('inlineSql.refreshSchema', async () => {
    await connectionManager.refreshSchema();
  });

  context.subscriptions.push(formatCommand, formatAllCommand, refreshCommand);

  // Auto-fetch schema on activation if connection is configured
  const connConfig = connectionManager.getActiveConnectionConfig();
  if (connConfig) {
    connectionManager.getSchema();
  }
}

export function deactivate(): void {
  // Cleanup
}
