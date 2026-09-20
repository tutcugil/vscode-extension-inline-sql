import * as vscode from 'vscode';
import { SqlFormatOptions, validateFormatOptions } from './formatOptions';

const CONFIG_NAME = '.sql-formatter.json';
const MAX_CONFIG_BYTES = 64 * 1024;

/** Read once per command so saved changes take effect without caching or watchers. */
export async function resolveFormatterOptions(document: vscode.TextDocument): Promise<SqlFormatOptions> {
  const settings = vscode.workspace.getConfiguration('inlineSql', document.uri);
  const fallback = {
    language: settings.get<string>('formatting.dialect', 'sql'),
    tabWidth: settings.get<number>('formatting.indent', 4),
    keywordCase: settings.get<boolean>('formatting.uppercase', true) ? 'upper' : 'preserve',
  };
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder || document.isUntitled) { return validateFormatOptions(fallback); }

  let directory = vscode.Uri.joinPath(document.uri, '..');
  for (;;) {
    const uri = vscode.Uri.joinPath(directory, CONFIG_NAME);
    let bytes: Uint8Array;
    try {
      const info = await vscode.workspace.fs.stat(uri);
      if (info.size > MAX_CONFIG_BYTES) { throw new Error('Configuration exceeds 64 KiB.'); }
      bytes = await vscode.workspace.fs.readFile(uri);
      if (bytes.byteLength > MAX_CONFIG_BYTES) { throw new Error('Configuration exceeds 64 KiB.'); }
    } catch (error) {
      if ((error as { code?: string }).code !== 'FileNotFound') {
        throw new Error(`${uri.toString()}: Could not read configuration. ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
      if (directory.path === folder.uri.path) { break; }
      const parent = vscode.Uri.joinPath(directory, '..');
      if (parent.path === directory.path) { break; }
      if (vscode.workspace.getWorkspaceFolder(parent)?.uri.toString() !== folder.uri.toString()) { break; }
      directory = parent;
      continue;
    }
    try {
      const json: unknown = JSON.parse(Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, ''));
      const fileOptions = validateFormatOptions(json);
      return validateFormatOptions({ ...fallback, ...fileOptions });
    } catch (error) {
      throw new Error(`${uri.toString()}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
  return validateFormatOptions(fallback);
}
