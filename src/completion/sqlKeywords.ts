import * as vscode from 'vscode';

interface SqlKeywordEntry {
  label: string;
  detail: string;
  kind: vscode.CompletionItemKind;
  /** Optional snippet insert text (e.g. "INSERT INTO $1 ($2) VALUES ($3)") */
  insertText?: string;
}

const DML_KEYWORDS: SqlKeywordEntry[] = [
  { label: 'SELECT', detail: 'Query data', kind: vscode.CompletionItemKind.Keyword, insertText: 'SELECT $1 FROM $2' },
  { label: 'INSERT INTO', detail: 'Insert data', kind: vscode.CompletionItemKind.Keyword, insertText: 'INSERT INTO $1 ($2) VALUES ($3)' },
  { label: 'UPDATE', detail: 'Update data', kind: vscode.CompletionItemKind.Keyword, insertText: 'UPDATE $1 SET $2 WHERE $3' },
  { label: 'DELETE FROM', detail: 'Delete data', kind: vscode.CompletionItemKind.Keyword, insertText: 'DELETE FROM $1 WHERE $2' },
  { label: 'CREATE TABLE', detail: 'Create a table', kind: vscode.CompletionItemKind.Keyword, insertText: 'CREATE TABLE $1 (\n\t$2\n)' },
  { label: 'ALTER TABLE', detail: 'Alter a table', kind: vscode.CompletionItemKind.Keyword, insertText: 'ALTER TABLE $1 $2' },
  { label: 'DROP TABLE', detail: 'Drop a table', kind: vscode.CompletionItemKind.Keyword, insertText: 'DROP TABLE IF EXISTS $1' },
  { label: 'TRUNCATE TABLE', detail: 'Truncate a table', kind: vscode.CompletionItemKind.Keyword },
  { label: 'CREATE INDEX', detail: 'Create an index', kind: vscode.CompletionItemKind.Keyword, insertText: 'CREATE INDEX $1 ON $2 ($3)' },
  { label: 'DROP INDEX', detail: 'Drop an index', kind: vscode.CompletionItemKind.Keyword },
  { label: 'CREATE VIEW', detail: 'Create a view', kind: vscode.CompletionItemKind.Keyword, insertText: 'CREATE VIEW $1 AS\nSELECT $2' },
  { label: 'MERGE', detail: 'Merge data', kind: vscode.CompletionItemKind.Keyword },
  { label: 'WITH', detail: 'Common Table Expression', kind: vscode.CompletionItemKind.Keyword, insertText: 'WITH $1 AS (\n\t$2\n)\nSELECT $3' },
];

const CLAUSE_KEYWORDS: SqlKeywordEntry[] = [
  { label: 'FROM', detail: 'Specify table source', kind: vscode.CompletionItemKind.Keyword },
  { label: 'WHERE', detail: 'Filter rows', kind: vscode.CompletionItemKind.Keyword },
  { label: 'AND', detail: 'Logical AND', kind: vscode.CompletionItemKind.Keyword },
  { label: 'OR', detail: 'Logical OR', kind: vscode.CompletionItemKind.Keyword },
  { label: 'NOT', detail: 'Logical NOT', kind: vscode.CompletionItemKind.Keyword },
  { label: 'IN', detail: 'Match any value in list', kind: vscode.CompletionItemKind.Keyword },
  { label: 'EXISTS', detail: 'Test for existence', kind: vscode.CompletionItemKind.Keyword },
  { label: 'BETWEEN', detail: 'Range check', kind: vscode.CompletionItemKind.Keyword, insertText: 'BETWEEN $1 AND $2' },
  { label: 'LIKE', detail: 'Pattern matching', kind: vscode.CompletionItemKind.Keyword },
  { label: 'IS NULL', detail: 'Check for NULL', kind: vscode.CompletionItemKind.Keyword },
  { label: 'IS NOT NULL', detail: 'Check for NOT NULL', kind: vscode.CompletionItemKind.Keyword },
  { label: 'ORDER BY', detail: 'Sort results', kind: vscode.CompletionItemKind.Keyword },
  { label: 'GROUP BY', detail: 'Group results', kind: vscode.CompletionItemKind.Keyword },
  { label: 'HAVING', detail: 'Filter groups', kind: vscode.CompletionItemKind.Keyword },
  { label: 'LIMIT', detail: 'Limit rows returned', kind: vscode.CompletionItemKind.Keyword },
  { label: 'OFFSET', detail: 'Skip rows', kind: vscode.CompletionItemKind.Keyword },
  { label: 'DISTINCT', detail: 'Remove duplicates', kind: vscode.CompletionItemKind.Keyword },
  { label: 'AS', detail: 'Alias', kind: vscode.CompletionItemKind.Keyword },
  { label: 'ON', detail: 'Join condition', kind: vscode.CompletionItemKind.Keyword },
  { label: 'UNION', detail: 'Combine results', kind: vscode.CompletionItemKind.Keyword },
  { label: 'UNION ALL', detail: 'Combine all results', kind: vscode.CompletionItemKind.Keyword },
  { label: 'INTERSECT', detail: 'Common results', kind: vscode.CompletionItemKind.Keyword },
  { label: 'EXCEPT', detail: 'Subtract results', kind: vscode.CompletionItemKind.Keyword },
  { label: 'INTO', detail: 'Insert destination', kind: vscode.CompletionItemKind.Keyword },
  { label: 'VALUES', detail: 'Row values', kind: vscode.CompletionItemKind.Keyword },
  { label: 'SET', detail: 'Set column values', kind: vscode.CompletionItemKind.Keyword },
  { label: 'RETURNING', detail: 'Return modified rows', kind: vscode.CompletionItemKind.Keyword },
  { label: 'ASC', detail: 'Ascending order', kind: vscode.CompletionItemKind.Keyword },
  { label: 'DESC', detail: 'Descending order', kind: vscode.CompletionItemKind.Keyword },
  { label: 'TOP', detail: 'Limit rows (T-SQL)', kind: vscode.CompletionItemKind.Keyword },
  { label: 'CASE', detail: 'Conditional expression', kind: vscode.CompletionItemKind.Keyword, insertText: 'CASE\n\tWHEN $1 THEN $2\n\tELSE $3\nEND' },
  { label: 'WHEN', detail: 'Case condition', kind: vscode.CompletionItemKind.Keyword },
  { label: 'THEN', detail: 'Case result', kind: vscode.CompletionItemKind.Keyword },
  { label: 'ELSE', detail: 'Case default', kind: vscode.CompletionItemKind.Keyword },
  { label: 'END', detail: 'End block', kind: vscode.CompletionItemKind.Keyword },
];

const JOIN_KEYWORDS: SqlKeywordEntry[] = [
  { label: 'INNER JOIN', detail: 'Inner join', kind: vscode.CompletionItemKind.Keyword, insertText: 'INNER JOIN $1 ON $2' },
  { label: 'LEFT JOIN', detail: 'Left outer join', kind: vscode.CompletionItemKind.Keyword, insertText: 'LEFT JOIN $1 ON $2' },
  { label: 'RIGHT JOIN', detail: 'Right outer join', kind: vscode.CompletionItemKind.Keyword, insertText: 'RIGHT JOIN $1 ON $2' },
  { label: 'FULL OUTER JOIN', detail: 'Full outer join', kind: vscode.CompletionItemKind.Keyword, insertText: 'FULL OUTER JOIN $1 ON $2' },
  { label: 'CROSS JOIN', detail: 'Cross join', kind: vscode.CompletionItemKind.Keyword, insertText: 'CROSS JOIN $1' },
  { label: 'JOIN', detail: 'Join tables', kind: vscode.CompletionItemKind.Keyword, insertText: 'JOIN $1 ON $2' },
];

const FUNCTION_KEYWORDS: SqlKeywordEntry[] = [
  // Aggregate
  { label: 'COUNT', detail: 'Count rows', kind: vscode.CompletionItemKind.Function, insertText: 'COUNT($1)' },
  { label: 'SUM', detail: 'Sum values', kind: vscode.CompletionItemKind.Function, insertText: 'SUM($1)' },
  { label: 'AVG', detail: 'Average value', kind: vscode.CompletionItemKind.Function, insertText: 'AVG($1)' },
  { label: 'MIN', detail: 'Minimum value', kind: vscode.CompletionItemKind.Function, insertText: 'MIN($1)' },
  { label: 'MAX', detail: 'Maximum value', kind: vscode.CompletionItemKind.Function, insertText: 'MAX($1)' },
  // String
  { label: 'CONCAT', detail: 'Concatenate strings', kind: vscode.CompletionItemKind.Function, insertText: 'CONCAT($1, $2)' },
  { label: 'SUBSTRING', detail: 'Extract substring', kind: vscode.CompletionItemKind.Function, insertText: 'SUBSTRING($1, $2, $3)' },
  { label: 'TRIM', detail: 'Trim whitespace', kind: vscode.CompletionItemKind.Function, insertText: 'TRIM($1)' },
  { label: 'UPPER', detail: 'Uppercase', kind: vscode.CompletionItemKind.Function, insertText: 'UPPER($1)' },
  { label: 'LOWER', detail: 'Lowercase', kind: vscode.CompletionItemKind.Function, insertText: 'LOWER($1)' },
  { label: 'LENGTH', detail: 'String length', kind: vscode.CompletionItemKind.Function, insertText: 'LENGTH($1)' },
  { label: 'REPLACE', detail: 'Replace string', kind: vscode.CompletionItemKind.Function, insertText: 'REPLACE($1, $2, $3)' },
  { label: 'COALESCE', detail: 'First non-null value', kind: vscode.CompletionItemKind.Function, insertText: 'COALESCE($1, $2)' },
  { label: 'NULLIF', detail: 'Return null if equal', kind: vscode.CompletionItemKind.Function, insertText: 'NULLIF($1, $2)' },
  { label: 'CAST', detail: 'Type conversion', kind: vscode.CompletionItemKind.Function, insertText: 'CAST($1 AS $2)' },
  { label: 'CONVERT', detail: 'Convert type', kind: vscode.CompletionItemKind.Function, insertText: 'CONVERT($1, $2)' },
  // Date
  { label: 'NOW', detail: 'Current timestamp', kind: vscode.CompletionItemKind.Function, insertText: 'NOW()' },
  { label: 'CURRENT_TIMESTAMP', detail: 'Current timestamp', kind: vscode.CompletionItemKind.Function },
  { label: 'GETDATE', detail: 'Current date (T-SQL)', kind: vscode.CompletionItemKind.Function, insertText: 'GETDATE()' },
  { label: 'DATEADD', detail: 'Add to date', kind: vscode.CompletionItemKind.Function, insertText: 'DATEADD($1, $2, $3)' },
  { label: 'DATEDIFF', detail: 'Date difference', kind: vscode.CompletionItemKind.Function, insertText: 'DATEDIFF($1, $2, $3)' },
  // Window
  { label: 'ROW_NUMBER', detail: 'Row number', kind: vscode.CompletionItemKind.Function, insertText: 'ROW_NUMBER() OVER ($1)' },
  { label: 'RANK', detail: 'Rank with gaps', kind: vscode.CompletionItemKind.Function, insertText: 'RANK() OVER ($1)' },
  { label: 'DENSE_RANK', detail: 'Rank without gaps', kind: vscode.CompletionItemKind.Function, insertText: 'DENSE_RANK() OVER ($1)' },
  { label: 'LAG', detail: 'Previous row value', kind: vscode.CompletionItemKind.Function, insertText: 'LAG($1, $2) OVER ($3)' },
  { label: 'LEAD', detail: 'Next row value', kind: vscode.CompletionItemKind.Function, insertText: 'LEAD($1, $2) OVER ($3)' },
  // Math
  { label: 'ABS', detail: 'Absolute value', kind: vscode.CompletionItemKind.Function, insertText: 'ABS($1)' },
  { label: 'ROUND', detail: 'Round number', kind: vscode.CompletionItemKind.Function, insertText: 'ROUND($1, $2)' },
  { label: 'CEILING', detail: 'Round up', kind: vscode.CompletionItemKind.Function, insertText: 'CEILING($1)' },
  { label: 'FLOOR', detail: 'Round down', kind: vscode.CompletionItemKind.Function, insertText: 'FLOOR($1)' },
  // Null handling
  { label: 'ISNULL', detail: 'Replace null (T-SQL)', kind: vscode.CompletionItemKind.Function, insertText: 'ISNULL($1, $2)' },
  { label: 'IFNULL', detail: 'Replace null (MySQL)', kind: vscode.CompletionItemKind.Function, insertText: 'IFNULL($1, $2)' },
];

const TYPE_KEYWORDS: SqlKeywordEntry[] = [
  { label: 'INT', detail: 'Integer', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'INTEGER', detail: 'Integer', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'BIGINT', detail: 'Big integer', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'SMALLINT', detail: 'Small integer', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'TINYINT', detail: 'Tiny integer', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'DECIMAL', detail: 'Fixed-point number', kind: vscode.CompletionItemKind.TypeParameter, insertText: 'DECIMAL($1, $2)' },
  { label: 'NUMERIC', detail: 'Fixed-point number', kind: vscode.CompletionItemKind.TypeParameter, insertText: 'NUMERIC($1, $2)' },
  { label: 'FLOAT', detail: 'Floating-point', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'REAL', detail: 'Single precision float', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'BIT', detail: 'Boolean (0/1)', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'BOOLEAN', detail: 'Boolean', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'VARCHAR', detail: 'Variable length string', kind: vscode.CompletionItemKind.TypeParameter, insertText: 'VARCHAR($1)' },
  { label: 'NVARCHAR', detail: 'Unicode variable string', kind: vscode.CompletionItemKind.TypeParameter, insertText: 'NVARCHAR($1)' },
  { label: 'CHAR', detail: 'Fixed length string', kind: vscode.CompletionItemKind.TypeParameter, insertText: 'CHAR($1)' },
  { label: 'TEXT', detail: 'Large text', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'DATE', detail: 'Date only', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'TIME', detail: 'Time only', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'DATETIME', detail: 'Date and time', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'TIMESTAMP', detail: 'Timestamp', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'UUID', detail: 'Universally unique identifier', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'JSON', detail: 'JSON data', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'JSONB', detail: 'Binary JSON (PostgreSQL)', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'BLOB', detail: 'Binary large object', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'SERIAL', detail: 'Auto-increment (PostgreSQL)', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'BIGSERIAL', detail: 'Big auto-increment (PostgreSQL)', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'UNIQUEIDENTIFIER', detail: 'GUID (T-SQL)', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'MONEY', detail: 'Currency (T-SQL)', kind: vscode.CompletionItemKind.TypeParameter },
  { label: 'XML', detail: 'XML data', kind: vscode.CompletionItemKind.TypeParameter },
];

export function buildCompletionItems(): vscode.CompletionItem[] {
  const allEntries = [
    ...DML_KEYWORDS,
    ...CLAUSE_KEYWORDS,
    ...JOIN_KEYWORDS,
    ...FUNCTION_KEYWORDS,
    ...TYPE_KEYWORDS,
  ];

  return allEntries.map(entry => {
    const item = new vscode.CompletionItem(entry.label, entry.kind);
    item.detail = entry.detail;
    item.sortText = getSortPrefix(entry.kind) + entry.label;
    if (entry.insertText) {
      item.insertText = new vscode.SnippetString(entry.insertText);
    }
    return item;
  });
}

function getSortPrefix(kind: vscode.CompletionItemKind): string {
  switch (kind) {
    case vscode.CompletionItemKind.Keyword: return '0';
    case vscode.CompletionItemKind.Function: return '1';
    case vscode.CompletionItemKind.TypeParameter: return '2';
    default: return '3';
  }
}
