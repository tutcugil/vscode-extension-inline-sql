import * as vscode from 'vscode';
import { detectSqlRegions, findSqlRegionAtOffset } from '../detection/sqlDetector';
import { buildCompletionItems } from './sqlKeywords';
import { SchemaInfo, TableInfo } from '../types';

export class SqlCompletionProvider implements vscode.CompletionItemProvider {
  private keywordItems: vscode.CompletionItem[];
  private schemaProvider: (() => SchemaInfo | undefined) | undefined;

  constructor(schemaProvider?: () => SchemaInfo | undefined) {
    this.keywordItems = buildCompletionItems();
    this.schemaProvider = schemaProvider;
  }

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.CompletionItem[] | undefined {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const languageId = document.languageId;

    // Detect SQL regions and check if cursor is inside one
    const config = vscode.workspace.getConfiguration('inlineSql');
    const minKeywords = config.get<number>('detection.minKeywords', 2);
    const regions = detectSqlRegions(text, languageId, minKeywords);
    const region = findSqlRegionAtOffset(regions, offset);

    if (!region) {
      return undefined;
    }

    const items: vscode.CompletionItem[] = [...this.keywordItems];

    // Context-aware: determine what came before the cursor
    const sqlBeforeCursor = text.slice(region.startOffset, offset);
    const context = getCompletionContext(sqlBeforeCursor);

    // Add schema-based completions if available
    const schema = this.schemaProvider?.();
    if (schema) {
      if (context === 'table') {
        items.push(...buildTableCompletionItems(schema));
      } else if (context === 'column') {
        const tableName = getTableNameBeforeDot(sqlBeforeCursor);
        if (tableName) {
          items.push(...buildColumnCompletionItems(schema, tableName));
        } else {
          // Add all columns from all referenced tables
          const referencedTables = extractReferencedTables(sqlBeforeCursor, schema);
          for (const table of referencedTables) {
            items.push(...buildColumnCompletionItems(schema, table.name));
          }
        }
      }
    }

    return items;
  }
}

type CompletionContext = 'table' | 'column' | 'general';

function getCompletionContext(sqlBefore: string): CompletionContext {
  const trimmed = sqlBefore.replace(/\s+/g, ' ').trimEnd().toUpperCase();

  // After FROM, JOIN, INTO, UPDATE, TABLE → suggest tables
  if (/(?:FROM|JOIN|INTO|UPDATE|TABLE)\s*$/i.test(trimmed)) {
    return 'table';
  }

  // After "tablename." → suggest columns
  if (/\w+\.\s*$/i.test(sqlBefore.trimEnd())) {
    return 'column';
  }

  // After SELECT, WHERE, ON, SET, BY, HAVING → suggest columns
  if (/(?:SELECT|WHERE|ON|SET|BY|HAVING|AND|OR)\s+$/i.test(trimmed)) {
    return 'column';
  }

  return 'general';
}

function getTableNameBeforeDot(sqlBefore: string): string | undefined {
  const match = sqlBefore.trimEnd().match(/(\w+)\.\s*$/);
  return match ? match[1] : undefined;
}

function extractReferencedTables(sqlBefore: string, schema: SchemaInfo): TableInfo[] {
  const tableNames = new Set<string>();
  const fromMatch = sqlBefore.matchAll(/(?:FROM|JOIN|INTO|UPDATE)\s+(\w+)/gi);
  for (const m of fromMatch) {
    tableNames.add(m[1].toLowerCase());
  }

  return schema.tables.filter(t =>
    tableNames.has(t.name.toLowerCase())
  );
}

function buildTableCompletionItems(schema: SchemaInfo): vscode.CompletionItem[] {
  return schema.tables.map(table => {
    const item = new vscode.CompletionItem(table.name, vscode.CompletionItemKind.Struct);
    item.detail = `Table${table.schema ? ` (${table.schema})` : ''} — ${table.columns.length} columns`;
    item.sortText = '0' + table.name;
    return item;
  });
}

function buildColumnCompletionItems(schema: SchemaInfo, tableName: string): vscode.CompletionItem[] {
  const table = schema.tables.find(t =>
    t.name.toLowerCase() === tableName.toLowerCase()
  );
  if (!table) { return []; }

  return table.columns.map(col => {
    const item = new vscode.CompletionItem(col.name, vscode.CompletionItemKind.Field);
    item.detail = `${col.dataType}${col.nullable ? ' (nullable)' : ''}`;
    item.sortText = '0' + col.name;
    return item;
  });
}
