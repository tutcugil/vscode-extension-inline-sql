import { SchemaInfo, TableInfo, ColumnInfo, DbConnectionConfig } from '../types';

export class SchemaCache {
  private cache: Map<string, SchemaInfo> = new Map();
  private ttlMs: number;

  constructor(ttlSeconds: number = 300) {
    this.ttlMs = ttlSeconds * 1000;
  }

  get(connectionName: string): SchemaInfo | undefined {
    const entry = this.cache.get(connectionName);
    if (!entry) { return undefined; }
    if (Date.now() - entry.lastUpdated > this.ttlMs) {
      this.cache.delete(connectionName);
      return undefined;
    }
    return entry;
  }

  set(connectionName: string, schema: SchemaInfo): void {
    this.cache.set(connectionName, schema);
  }

  invalidate(connectionName?: string): void {
    if (connectionName) {
      this.cache.delete(connectionName);
    } else {
      this.cache.clear();
    }
  }

  setTTL(ttlSeconds: number): void {
    this.ttlMs = ttlSeconds * 1000;
  }
}
