import * as vscode from 'vscode';
import { DbConnectionConfig, SchemaInfo, TableInfo, ColumnInfo } from '../types';
import { SchemaCache } from './schemaCache';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyRequire(moduleName: string): any {
  try {
    return require(moduleName);
  } catch {
    throw new Error(`Driver package "${moduleName}" is not installed. Run: npm install ${moduleName}`);
  }
}

export class ConnectionManager implements vscode.Disposable {
  private schemaCache: SchemaCache;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    const config = vscode.workspace.getConfiguration('inlineSql');
    const ttl = config.get<number>('schemaCacheTTL', 300);
    this.schemaCache = new SchemaCache(ttl);

    // Listen for config changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('inlineSql.schemaCacheTTL')) {
          const newTTL = vscode.workspace.getConfiguration('inlineSql').get<number>('schemaCacheTTL', 300);
          this.schemaCache.setTTL(newTTL);
        }
        if (e.affectsConfiguration('inlineSql.connections') || e.affectsConfiguration('inlineSql.activeConnection')) {
          this.schemaCache.invalidate();
        }
      })
    );
  }

  getActiveConnectionConfig(): DbConnectionConfig | undefined {
    const config = vscode.workspace.getConfiguration('inlineSql');
    const connections = config.get<DbConnectionConfig[]>('connections', []);
    const activeName = config.get<string>('activeConnection', '');

    if (!activeName || connections.length === 0) {
      return undefined;
    }

    return connections.find(c => c.name === activeName);
  }

  async getSchema(): Promise<SchemaInfo | undefined> {
    const connConfig = this.getActiveConnectionConfig();
    if (!connConfig) { return undefined; }

    // Check cache
    const cached = this.schemaCache.get(connConfig.name);
    if (cached) { return cached; }

    // Fetch from database
    try {
      const schema = await this.fetchSchema(connConfig);
      if (schema) {
        this.schemaCache.set(connConfig.name, schema);
      }
      return schema;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Inline SQL: Failed to fetch schema — ${message}`);
      return undefined;
    }
  }

  getSchemaSync(): SchemaInfo | undefined {
    const connConfig = this.getActiveConnectionConfig();
    if (!connConfig) { return undefined; }
    return this.schemaCache.get(connConfig.name);
  }

  async refreshSchema(): Promise<void> {
    this.schemaCache.invalidate();
    const schema = await this.getSchema();
    if (schema) {
      vscode.window.showInformationMessage(
        `Inline SQL: Schema refreshed — ${schema.tables.length} tables loaded.`
      );
    }
  }

  private async fetchSchema(config: DbConnectionConfig): Promise<SchemaInfo | undefined> {
    switch (config.driver) {
      case 'postgres':
        return this.fetchPostgresSchema(config);
      case 'mysql':
        return this.fetchMysqlSchema(config);
      case 'mssql':
        return this.fetchMssqlSchema(config);
      default:
        return undefined;
    }
  }

  private async fetchPostgresSchema(config: DbConnectionConfig): Promise<SchemaInfo> {
    const pg = lazyRequire('pg');
    const client = new pg.Client({
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      user: config.user,
      password: config.password,
    });

    try {
      await client.connect();
      const result = await client.query(`
        SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.is_nullable
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON c.table_schema = t.table_schema AND c.table_name = t.table_name
        WHERE t.table_type = 'BASE TABLE'
          AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
      `);

      return buildSchemaFromRows(result.rows, 'table_schema', 'table_name', 'column_name', 'data_type', 'is_nullable');
    } finally {
      await client.end();
    }
  }

  private async fetchMysqlSchema(config: DbConnectionConfig): Promise<SchemaInfo> {
    const mysql = lazyRequire('mysql2/promise');
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port || 3306,
      database: config.database,
      user: config.user,
      password: config.password,
    });

    try {
      const [rows] = await connection.execute(`
        SELECT table_schema, table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = ?
        ORDER BY table_name, ordinal_position
      `, [config.database]);

      return buildSchemaFromRows(rows as Record<string, string>[], 'TABLE_SCHEMA', 'TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE', 'IS_NULLABLE');
    } finally {
      await connection.end();
    }
  }

  private async fetchMssqlSchema(config: DbConnectionConfig): Promise<SchemaInfo> {
    const mssql = lazyRequire('mssql');
    const pool = await mssql.connect({
      server: config.host,
      port: config.port || 1433,
      database: config.database,
      user: config.user,
      password: config.password,
      options: { encrypt: false, trustServerCertificate: true },
    });

    try {
      const result = await pool.request().query(`
        SELECT s.name AS table_schema, t.name AS table_name, c.name AS column_name,
               ty.name AS data_type, c.is_nullable
        FROM sys.columns c
        JOIN sys.tables t ON c.object_id = t.object_id
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.types ty ON c.user_type_id = ty.user_type_id
        ORDER BY s.name, t.name, c.column_id
      `);

      return buildSchemaFromRows(result.recordset, 'table_schema', 'table_name', 'column_name', 'data_type', 'is_nullable');
    } finally {
      await pool.close();
    }
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}

function buildSchemaFromRows(
  rows: Record<string, unknown>[],
  schemaCol: string, tableCol: string, columnCol: string, typeCol: string, nullableCol: string
): SchemaInfo {
  const tableMap = new Map<string, TableInfo>();

  for (const row of rows) {
    const tableName = String(row[tableCol]);
    const key = tableName.toLowerCase();

    if (!tableMap.has(key)) {
      tableMap.set(key, {
        name: tableName,
        schema: row[schemaCol] ? String(row[schemaCol]) : undefined,
        columns: [],
      });
    }

    const table = tableMap.get(key)!;
    table.columns.push({
      name: String(row[columnCol]),
      dataType: String(row[typeCol]),
      nullable: String(row[nullableCol]).toUpperCase() === 'YES' || row[nullableCol] === true || row[nullableCol] === 1,
    });
  }

  return {
    tables: Array.from(tableMap.values()),
    lastUpdated: Date.now(),
  };
}
