import * as vscode from 'vscode';
import { DbConnectionConfig, SchemaInfo, TableInfo } from '../types';

import { createRequire } from 'node:module';
import * as path from 'node:path';
import { SchemaCache } from './schemaCache';

/** Whitelist of allowed database driver modules */
const ALLOWED_DRIVER_MODULES = new Set(['pg', 'mysql2/promise', 'mssql']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyRequire(moduleName: string): any {
  if (!ALLOWED_DRIVER_MODULES.has(moduleName)) {
    throw new Error(`Driver module "${moduleName}" is not in the allowed list.`);
  }
  if (!vscode.workspace.isTrusted) { throw new Error('Database drivers require a trusted workspace.'); }
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    if (folder.uri.scheme !== 'file') { continue; }
    const requireFromWorkspace = createRequire(path.join(folder.uri.fsPath, 'package.json'));
    let resolved: string;
    try { resolved = requireFromWorkspace.resolve(moduleName); }
    catch { continue; }
    return requireFromWorkspace(resolved);
  }
  throw new Error(`Install ${moduleName.split('/')[0]} in a trusted workspace to use schema completion.`);
}

/** Connection timeout in milliseconds */
const CONNECTION_TIMEOUT_MS = 10000;

export class ConnectionManager implements vscode.Disposable {
  private schemaCache: SchemaCache;
  private disposables: vscode.Disposable[] = [];
  private passwordWarningShown = false;
  private generation = 0;
  private nextRetryTime = 0;
  private disposed = false;
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
          this.invalidate();
        }
      })
    );
  }

  getActiveConnectionConfig(): DbConnectionConfig | undefined {
    if (this.disposed || !vscode.workspace.isTrusted) { return undefined; }
    const config = vscode.workspace.getConfiguration('inlineSql');
    const connections = config.get<DbConnectionConfig[]>('connections', []);
    const activeName = config.get<string>('activeConnection', '');

    if (!activeName || !Array.isArray(connections) || connections.length === 0) {
      return undefined;
    }

    const conn = connections.find(c => c && c.name === activeName);
    if (!conn || !['postgres', 'mysql', 'mssql'].includes(conn.driver) ||
        typeof conn.host !== 'string' || !conn.host ||
        typeof conn.database !== 'string' || !conn.database ||
        (conn.user !== undefined && typeof conn.user !== 'string') ||
        (conn.password !== undefined && typeof conn.password !== 'string') ||
        (conn.passwordEnv !== undefined && (typeof conn.passwordEnv !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(conn.passwordEnv)))) {
      return undefined;
    }

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
        'Use the passwordEnv setting to read an environment variable instead.'
      );
    }

    if (conn.passwordEnv && process.env[conn.passwordEnv] === undefined) {
      return undefined;
    }
    return { ...conn, password: conn.passwordEnv ? process.env[conn.passwordEnv] : conn.password };
  }

  async getSchema(): Promise<SchemaInfo | undefined> {
    const connConfig = this.getActiveConnectionConfig();
    if (!connConfig) { return undefined; }

    // Check cache
    const cached = this.schemaCache.get(connConfig.name);
    if (cached) { return cached; }

    if (Date.now() < this.nextRetryTime) { return undefined; }

    // Deduplicate concurrent fetches — use a stable reference
    if (this.pendingSchemaFetch) {
      return this.pendingSchemaFetch;
    }

    const fetchPromise = this.doFetchSchema(connConfig, this.generation);
    this.pendingSchemaFetch = fetchPromise;

    // Clear pending reference only if it's still the same promise (prevents race)
    fetchPromise.finally(() => {
      if (this.pendingSchemaFetch === fetchPromise) {
        this.pendingSchemaFetch = null;
      }
    });

    return fetchPromise;
  }

  private async doFetchSchema(connConfig: DbConnectionConfig, generation: number): Promise<SchemaInfo | undefined> {
    try {
      const schema = await this.fetchSchema(connConfig);
      if (this.disposed || generation !== this.generation) { return undefined; }
      if (schema) {
        this.schemaCache.set(connConfig.name, schema);
      }
      return schema;
    } catch (err) {
      if (this.disposed || generation !== this.generation) { return undefined; }
      // Driver errors may contain connection strings or passwords. Do not log them.
      void err;
      this.nextRetryTime = Date.now() + 30000;
      vscode.window.showErrorMessage('Inline SQL: Failed to fetch schema. Check the connection settings, credentials and installed driver.');
      return undefined;
    }
  }

  getSchemaSync(): SchemaInfo | undefined {
    const connConfig = this.getActiveConnectionConfig();
    if (!connConfig) { return undefined; }
    return this.schemaCache.get(connConfig.name);
  }

  async refreshSchema(): Promise<void> {
    this.invalidate();
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
        SELECT table_schema AS TABLE_SCHEMA, table_name AS TABLE_NAME, column_name AS COLUMN_NAME,
               data_type AS DATA_TYPE, is_nullable AS IS_NULLABLE
        FROM information_schema.columns
        WHERE table_schema = ?
        ORDER BY table_name, ordinal_position
      `, [config.database]);

      return buildSchemaFromRows(rows as Record<string, string>[], 'TABLE_SCHEMA', 'TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE', 'IS_NULLABLE');
    } finally {
      await connection.end().catch(() => { /* ignore cleanup error */ });
    }
  }

  private async fetchMssqlSchema(config: DbConnectionConfig): Promise<SchemaInfo> {
    const mssql = lazyRequire('mssql');
    const pool = new mssql.ConnectionPool({
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
      await pool.connect();
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
      await pool.close().catch(() => { /* ignore cleanup error */ });
    }
  }

  private invalidate(): void {
    this.generation++;
    this.nextRetryTime = 0;
    this.pendingSchemaFetch = null;
    this.schemaCache.invalidate();
  }

  dispose(): void {
    this.disposed = true;
    this.invalidate();
    this.disposables.forEach(d => d.dispose());
  }
}

/** Clamp TTL to a valid range: 1–86400 seconds (1 second to 24 hours) */
function clampTTL(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(Math.floor(value), 86400)) : 300;
}

export function buildSchemaFromRows(
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
    const key = JSON.stringify([row[schemaCol] ?? null, tableName]);

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
