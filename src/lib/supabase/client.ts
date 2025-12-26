/**
 * Supabase-like client shim that uses Neon PostgreSQL
 * This maintains API compatibility with existing code while using Neon
 */

import { query } from '@/lib/db';
import { Logger } from '@/lib/logger';

// Types to maintain compatibility
type QueryResult<T> = {
  data: T | null;
  error: Error | null;
  status: number;
  statusText: string;
};

type SelectQueryBuilder<T> = {
  select: (columns?: string) => SelectQueryBuilder<T>;
  eq: (column: string, value: unknown) => SelectQueryBuilder<T>;
  neq: (column: string, value: unknown) => SelectQueryBuilder<T>;
  in: (column: string, values: unknown[]) => SelectQueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => SelectQueryBuilder<T>;
  limit: (count: number) => SelectQueryBuilder<T>;
  single: () => Promise<QueryResult<T>>;
  maybeSingle: () => Promise<QueryResult<T | null>>;
  then: <TResult>(onfulfilled?: (value: QueryResult<T[]>) => TResult) => Promise<TResult>;
};

type InsertQueryBuilder<T> = {
  select: (columns?: string) => InsertQueryBuilder<T>;
  single: () => Promise<QueryResult<T>>;
  then: <TResult>(onfulfilled?: (value: QueryResult<T[]>) => TResult) => Promise<TResult>;
};

type UpdateQueryBuilder<T> = {
  eq: (column: string, value: unknown) => UpdateQueryBuilder<T>;
  select: (columns?: string) => UpdateQueryBuilder<T>;
  single: () => Promise<QueryResult<T>>;
  then: <TResult>(onfulfilled?: (value: QueryResult<T[]>) => TResult) => Promise<TResult>;
};

type DeleteQueryBuilder<T> = {
  eq: (column: string, value: unknown) => DeleteQueryBuilder<T>;
  in: (column: string, values: unknown[]) => DeleteQueryBuilder<T>;
  then: <TResult>(onfulfilled?: (value: QueryResult<T[]>) => TResult) => Promise<TResult>;
};

type UpsertQueryBuilder<T> = {
  select: (columns?: string) => UpsertQueryBuilder<T>;
  single: () => Promise<QueryResult<T>>;
  then: <TResult>(onfulfilled?: (value: QueryResult<T[]>) => TResult) => Promise<TResult>;
};

// Helper to convert snake_case to camelCase in returned objects
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function transformKeys<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    result[snakeToCamel(key)] = obj[key];
  }
  return result as T;
}
// Table builder
function createTableBuilder<T>(tableName: string) {
  return {
    select(columns?: string): SelectQueryBuilder<T> {
      const conditions: { column: string; op: string; value: unknown }[] = [];
      let orderBy: { column: string; ascending: boolean } | null = null;
      let limitCount: number | null = null;
      let selectedColumns = columns || '*';

      const builder: SelectQueryBuilder<T> = {
        select(cols?: string) {
          if (cols) selectedColumns = cols;
          return builder;
        },
        eq(column: string, value: unknown) {
          conditions.push({ column, op: '=', value });
          return builder;
        },
        neq(column: string, value: unknown) {
          conditions.push({ column, op: '!=', value });
          return builder;
        },
        in(column: string, values: unknown[]) {
          conditions.push({ column, op: 'IN', value: values });
          return builder;
        },
        order(column: string, options?: { ascending?: boolean }) {
          orderBy = { column, ascending: options?.ascending ?? true };
          return builder;
        },
        limit(count: number) {
          limitCount = count;
          return builder;
        },
        async single(): Promise<QueryResult<T>> {
          try {
            const result = await execute();
            if (result.data && result.data.length > 0) {
              return { data: result.data[0], error: null, status: 200, statusText: 'OK' };
            }
            return { data: null, error: null, status: 200, statusText: 'OK' };
          } catch (e) {
            return { data: null, error: e as Error, status: 500, statusText: 'Error' };
          }
        },
        async maybeSingle(): Promise<QueryResult<T | null>> {
          return this.single();
        },
        then<TResult>(onfulfilled?: (value: QueryResult<T[]>) => TResult): Promise<TResult> {
          return execute().then(onfulfilled as (value: QueryResult<T[]>) => TResult);
        },
      };

      async function execute(): Promise<QueryResult<T[]>> {
        try {
          let sql = `SELECT ${selectedColumns} FROM ${tableName}`;
          const params: unknown[] = [];
          
          if (conditions.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const whereClauses = conditions.map((c, _i) => {
              if (c.op === 'IN') {
                const inPlaceholders = (c.value as unknown[]).map((_, j) => `$${params.length + j + 1}`).join(', ');
                params.push(...(c.value as unknown[]));
                return `${c.column} IN (${inPlaceholders})`;
              }
              params.push(c.value);
              return `${c.column} ${c.op} $${params.length}`;
            });
            sql += ` WHERE ${whereClauses.join(' AND ')}`;
          }
          
          if (orderBy) {
            sql += ` ORDER BY ${orderBy.column} ${orderBy.ascending ? 'ASC' : 'DESC'}`;
          }
          
          if (limitCount) {
            sql += ` LIMIT ${limitCount}`;
          }
          
          const rows = await query<Record<string, unknown>>(sql, params);
          return { 
            data: rows as T[], 
            error: null, 
            status: 200, 
            statusText: 'OK' 
          };
        } catch (err) {
          Logger.error('DB', `Query error on ${tableName}`, { err });
          return { data: null, error: err as Error, status: 500, statusText: 'Error' };
        }
      }

      return builder;
    },

    insert(data: Partial<T> | Partial<T>[]): InsertQueryBuilder<T> {
      const rows = Array.isArray(data) ? data : [data];
      let returnColumns = '*';
      
      const builder: InsertQueryBuilder<T> = {
        select(columns?: string) {
          if (columns) returnColumns = columns;
          return builder;
        },
        async single(): Promise<QueryResult<T>> {
          const result = await execute();
          if (result.data && result.data.length > 0) {
            return { data: result.data[0], error: null, status: 201, statusText: 'Created' };
          }
          return { data: null, error: result.error, status: result.status, statusText: result.statusText };
        },
        then<TResult>(onfulfilled?: (value: QueryResult<T[]>) => TResult): Promise<TResult> {
          return execute().then(onfulfilled as (value: QueryResult<T[]>) => TResult);
        },
      };

      async function execute(): Promise<QueryResult<T[]>> {
        try {
          const results: T[] = [];
          for (const row of rows) {
            const keys = Object.keys(row as object);
            const values = Object.values(row as object);
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
            
            const sql = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING ${returnColumns}`;
            const inserted = await query<T>(sql, values);
            results.push(...inserted);
          }
          return { data: results, error: null, status: 201, statusText: 'Created' };
        } catch (err) {
          Logger.error('DB', `Insert error on ${tableName}`, { err });
          return { data: null, error: err as Error, status: 500, statusText: 'Error' };
        }
      }

      return builder;
    },

    upsert(data: Partial<T> | Partial<T>[], options?: { onConflict?: string }): UpsertQueryBuilder<T> {
      const rows = Array.isArray(data) ? data : [data];
      let returnColumns = '*';
      const conflictColumn = options?.onConflict || 'id';
      
      const builder: UpsertQueryBuilder<T> = {
        select(columns?: string) {
          if (columns) returnColumns = columns;
          return builder;
        },
        async single(): Promise<QueryResult<T>> {
          const result = await execute();
          if (result.data && result.data.length > 0) {
            return { data: result.data[0], error: null, status: 200, statusText: 'OK' };
          }
          return { data: null, error: result.error, status: result.status, statusText: result.statusText };
        },
        then<TResult>(onfulfilled?: (value: QueryResult<T[]>) => TResult): Promise<TResult> {
          return execute().then(onfulfilled as (value: QueryResult<T[]>) => TResult);
        },
      };

      async function execute(): Promise<QueryResult<T[]>> {
        try {
          const results: T[] = [];
          for (const row of rows) {
            const keys = Object.keys(row as object);
            const values = Object.values(row as object);
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
            
            // Build ON CONFLICT UPDATE SET clause (exclude the conflict column)
            const updateClauses = keys
              .filter(k => k !== conflictColumn)
              .map(k => `${k} = EXCLUDED.${k}`)
              .join(', ');
            
            const sql = updateClauses
              ? `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders}) 
                 ON CONFLICT (${conflictColumn}) DO UPDATE SET ${updateClauses}
                 RETURNING ${returnColumns}`
              : `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders}) 
                 ON CONFLICT (${conflictColumn}) DO NOTHING
                 RETURNING ${returnColumns}`;
            
            const upserted = await query<T>(sql, values);
            results.push(...upserted);
          }
          return { data: results, error: null, status: 200, statusText: 'OK' };
        } catch (err) {
          Logger.error('DB', `Upsert error on ${tableName}`, { err });
          return { data: null, error: err as Error, status: 500, statusText: 'Error' };
        }
      }

      return builder;
    },

    update(data: Partial<T>): UpdateQueryBuilder<T> {
      const conditions: { column: string; value: unknown }[] = [];
      let returnColumns: string | null = null;
      
      const builder: UpdateQueryBuilder<T> = {
        eq(column: string, value: unknown) {
          conditions.push({ column, value });
          return builder;
        },
        select(columns?: string) {
          returnColumns = columns || '*';
          return builder;
        },
        async single(): Promise<QueryResult<T>> {
          const result = await execute();
          if (result.data && result.data.length > 0) {
            return { data: result.data[0], error: null, status: 200, statusText: 'OK' };
          }
          return { data: null, error: result.error, status: result.status, statusText: result.statusText };
        },
        then<TResult>(onfulfilled?: (value: QueryResult<T[]>) => TResult): Promise<TResult> {
          return execute().then(onfulfilled as (value: QueryResult<T[]>) => TResult);
        },
      };

      async function execute(): Promise<QueryResult<T[]>> {
        try {
          const updates = Object.entries(data as object);
          const setClause = updates.map(([key], i) => `${key} = $${i + 1}`).join(', ');
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const params = updates.map(([_key, value]) => value);
          
          let sql = `UPDATE ${tableName} SET ${setClause}`;
          
          if (conditions.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const whereClause = conditions.map((c, _i) => {
              params.push(c.value);
              return `${c.column} = $${params.length}`;
            }).join(' AND ');
            sql += ` WHERE ${whereClause}`;
          }
          
          if (returnColumns) {
            sql += ` RETURNING ${returnColumns}`;
          }
          
          const rows = await query<T>(sql, params);
          return { data: rows, error: null, status: 200, statusText: 'OK' };
        } catch (err) {
          Logger.error('DB', `Update error on ${tableName}`, { err });
          return { data: null, error: err as Error, status: 500, statusText: 'Error' };
        }
      }

      return builder;
    },

    delete(): DeleteQueryBuilder<T> {
      const conditions: { column: string; op: string; value: unknown }[] = [];
      
      const builder: DeleteQueryBuilder<T> = {
        eq(column: string, value: unknown) {
          conditions.push({ column, op: '=', value });
          return builder;
        },
        in(column: string, values: unknown[]) {
          conditions.push({ column, op: 'IN', value: values });
          return builder;
        },
        then<TResult>(onfulfilled?: (value: QueryResult<T[]>) => TResult): Promise<TResult> {
          return execute().then(onfulfilled as (value: QueryResult<T[]>) => TResult);
        },
      };

      async function execute(): Promise<QueryResult<T[]>> {
        try {
          let sql = `DELETE FROM ${tableName}`;
          const params: unknown[] = [];
          
          if (conditions.length > 0) {
            const whereClauses = conditions.map((c) => {
              if (c.op === 'IN') {
                const inPlaceholders = (c.value as unknown[]).map((_, j) => `$${params.length + j + 1}`).join(', ');
                params.push(...(c.value as unknown[]));
                return `${c.column} IN (${inPlaceholders})`;
              }
              params.push(c.value);
              return `${c.column} ${c.op} $${params.length}`;
            }).join(' AND ');
            sql += ` WHERE ${whereClauses}`;
          }
          
          await query(sql, params);
          return { data: [], error: null, status: 200, statusText: 'OK' };
        } catch (err) {
          Logger.error('DB', `Delete error on ${tableName}`, { err });
          return { data: null, error: err as Error, status: 500, statusText: 'Error' };
        }
      }

      return builder;
    },
  };
}

// Create Supabase-like client
function createNeonClient() {
  // Table name mappings for compatibility (Supabase -> Neon)
  const tableAliases: Record<string, string> = {
    'profiles': 'users',  // Supabase profiles -> our users table
  };

  return {
    from<T = unknown>(table: string) {
      const actualTable = tableAliases[table] || table;
      return createTableBuilder<T>(actualTable);
    },
    auth: {
      // Auth is handled by Auth.js, these are stubs for compatibility
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
      signInWithOAuth: async () => ({ data: null, error: new Error('Use Auth.js for OAuth') }),
      signInWithOtp: async () => ({ data: null, error: new Error('Use Auth.js for OTP') }),
      signUp: async () => ({ data: null, error: new Error('Use Auth.js for signup') }),
      signInWithPassword: async () => ({ data: null, error: new Error('Use Auth.js for password login') }),
      exchangeCodeForSession: async () => ({ data: null, error: new Error('Use Auth.js for code exchange') }),
    },
    rpc: async <T>(fn: string, params?: Record<string, unknown>): Promise<QueryResult<T>> => {
      try {
        const paramKeys = params ? Object.keys(params) : [];
        const paramValues = params ? Object.values(params) : [];
        const placeholders = paramKeys.map((k, i) => `${k} := $${i + 1}`).join(', ');
        
        const sql = `SELECT ${fn}(${placeholders}) as result`;
        const rows = await query<{ result: T }>(sql, paramValues);
        return { data: rows[0]?.result ?? null, error: null, status: 200, statusText: 'OK' };
      } catch (err) {
        return { data: null, error: err as Error, status: 500, statusText: 'Error' };
      }
    },
  };
}

// Singleton
let client: ReturnType<typeof createNeonClient> | null = null;

export function getSupabaseClient() {
  if (!client) {
    Logger.info('DB', 'Initializing Neon-based client (Supabase API compatible)');
    client = createNeonClient();
  }
  return client;
}

// Export type for compatibility
export type { QueryResult };
