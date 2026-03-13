import * as vscode from 'vscode';
import { DbConnectionConfig, SchemaInfo, TableInfo, ColumnInfo } from '../types';
import { SchemaCache } from './schemaCache';

/** Whitelist of allowed database driver modules */
const ALLOWED_DRIVER_MODULES = new Set(['pg', 'mysql2/promise', 'mssql']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyRequire(moduleName: string): any {
  if (!ALLOWED_DRIVER_MODULES.has(moduleName)) {
    throw new Error(`Driver module "${moduleName}" is not in the allowed list.`);
  }
  try {
    return require(moduleName);
  } catch {
    throw new Error(`Driver package "${moduleName}" is not installed. Run: npm install ${moduleName}`);
  }
}

/** Connection timeout in milliseconds */
const CONNECTION_TIMEOUT_MS = 10000;

export class ConnectionManager implements vscode.Disposable {
  private schemaCache: SchemaCache;
  private disposables: vscode.Disposable[] = [];
  private passwordWarningShown = false;
  private pendingSchemaFetch: Promise<SchemaInfo | undefined> | null = null;

  constructor() {
    const config = vscode.workspace.getConfiguration('inlineSql');
    const ttl = clampTTL(config.get<number>('schemaCacheTTL', 300));
    this.schemaCache = new SchemaCache(ttl);

    // Listen for config changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('inlineSql.schemaCacheTTL')) {
          const newTTL = clampTTL(
            vscode.workspace.getConfiguration('inlineSql').get<number>('schemaCacheTTL', 300)
          );
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

    const conn = connections.find(c => c.name === activeName);
    if (!conn) { return undefined; }

    // Validate host format (basic sanity check)
    if (conn.host && !/^[\w.\-:[\]]+$/.test(conn.host)) {
      vscode.window.showErrorMessage('Inline SQL: Invalid host format in connection configuration.');
      return undefined;
    }

    // Validate port range
    if (conn.port !== undefined && (conn.port < 1 || conn.port > 65535 || !Number.isInteger(conn.port))) {
      vscode.window.showErrorMessage('Inline SQL: Invalid port in connection configuration (must be 1-65535).');
      return undefined;
    }

    // Warn once if password is stored in plaintext settings
    if (conn.password && !this.passwordWarningShown) {
      this.passwordWarningShown = true;
      vscode.window.showWarningMessage(
        'Inline SQL: Database password is stored in plaintext in settings.json. ' +
        'Consider using environment variables instead.'
      );
    }

    return conn;
  }

  async getSchema(): Promise<SchemaInfo | undefined> {
    const connConfig = this.getActiveConnectionConfig();
    if (!connConfig) { return undefined; }

    // Check cache
    const cached = this.schemaCache.get(connConfig.name);
    if (cached) { return cached; }

    // Deduplicate concurrent fetches — use a stable reference
    if (this.pendingSchemaFetch) {
      return this.pendingSchemaFetch;
    }

    const fetchPromise = this.doFetchSchema(connConfig);
    this.pendingSchemaFetch = fetchPromise;

    // Clear pending reference only if it's still the same promise (prevents race)
    fetchPromise.finally(() => {
      if (this.pendingSchemaFetch === fetchPromise) {
        this.pendingSchemaFetch = null;
      }
    });

    return fetchPromise;
  }

  private async doFetchSchema(connConfig: DbConnectionConfig): Promise<SchemaInfo | undefined> {
    try {
      const schema = await this.fetchSchema(connConfig);
      if (schema) {
        this.schemaCache.set(connConfig.name, schema);
      }
      return schema;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Inline SQL: schema fetch error:', message);
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
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      query_timeout: CONNECTION_TIMEOUT_MS,
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
    } catch (err) {
      await client.end().catch(() => { /* ignore cleanup error */ });
      throw new Error(`PostgreSQL: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await client.end().catch(() => { /* ignore cleanup error */ });
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
      connectTimeout: CONNECTION_TIMEOUT_MS,
    });

    try {
      const [rows] = await connection.execute(`
        SELECT table_schema, table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = ?
        ORDER BY table_name, ordinal_position
      `, [config.database]);

      return buildSchemaFromRows(rows as Record<string, string>[], 'TABLE_SCHEMA', 'TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE', 'IS_NULLABLE');
    } catch (err) {
      throw new Error(`MySQL: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await connection.end().catch(() => { /* ignore cleanup error */ });
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
      options: { encrypt: true, trustServerCertificate: false },
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      requestTimeout: CONNECTION_TIMEOUT_MS,
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
    } catch (err) {
      throw new Error(`MSSQL: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await pool.close().catch(() => { /* ignore cleanup error */ });
    }
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}

/** Clamp TTL to a valid range: 1–86400 seconds (1 second to 24 hours) */
function clampTTL(value: number): number {
  return Math.max(1, Math.min(Math.floor(value), 86400));
}

function buildSchemaFromRows(
  rows: Record<string, unknown>[],
  schemaCol: string, tableCol: string, columnCol: string, typeCol: string, nullableCol: string
): SchemaInfo {
  const tableMap = new Map<string, TableInfo>();

  for (const row of rows) {
    // Skip rows with missing required columns
    if (row[tableCol] == null || row[columnCol] == null || row[typeCol] == null) {
      continue;
    }

    const tableName = String(row[tableCol]);
    const key = tableName.toLowerCase();

    if (!tableMap.has(key)) {
      tableMap.set(key, {
        name: tableName,
        schema: row[schemaCol] != null ? String(row[schemaCol]) : undefined,
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
