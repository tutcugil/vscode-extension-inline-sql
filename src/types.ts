export interface SqlRegion {
  /** Document offset where SQL content begins (inside the string delimiter) */
  startOffset: number;
  /** Document offset where SQL content ends (before the closing string delimiter) */
  endOffset: number;
  /** The raw SQL text with interpolations replaced by placeholders */
  sqlText: string;
  /** The host language ID */
  languageId: string;
}

export interface StringLiteral {
  /** Document offset where the string content begins (after opening delimiter) */
  contentStart: number;
  /** Document offset where the string content ends (before closing delimiter) */
  contentEnd: number;
  /** The raw string content */
  content: string;
  /** Type of string literal */
  type: 'single' | 'double' | 'template' | 'triple' | 'verbatim' | 'raw' | 'textblock';
}

export interface DbConnectionConfig {
  name: string;
  driver: 'postgres' | 'mysql' | 'mssql';
  host: string;
  port?: number;
  database: string;
  user?: string;
  password?: string;
}

export interface SchemaInfo {
  tables: TableInfo[];
  lastUpdated: number;
}

export interface TableInfo {
  name: string;
  schema?: string;
  columns: ColumnInfo[];
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
}
