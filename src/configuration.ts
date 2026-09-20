import * as vscode from 'vscode';
import { detectSqlRegions } from './detection/sqlDetector';
import { SqlRegion } from './types';

export const SUPPORTED_LANGUAGES = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact', 'python', 'java', 'csharp'];

export function documentSqlRegions(document: vscode.TextDocument): SqlRegion[] {
  const config = vscode.workspace.getConfiguration('inlineSql', document.uri);
  const languages = config.get<string[]>('languages', SUPPORTED_LANGUAGES);
  if (!Array.isArray(languages) || !languages.includes(document.languageId)) { return []; }
  const minimum = config.get<number>('detection.minKeywords', 2);
  return detectSqlRegions(document.getText(), document.languageId,
    Number.isFinite(minimum) ? Math.max(1, Math.floor(minimum)) : 2);
}
