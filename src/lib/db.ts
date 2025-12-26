import { neon, neonConfig } from '@neondatabase/serverless';

// Configuración de Neon
neonConfig.fetchConnectionCache = true;

// Singleton para conexión a Neon
let sqlClient: ReturnType<typeof neon> | null = null;

export function getDb() {
  if (!sqlClient) {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error(
        'Missing DATABASE_URL environment variable. ' +
        'Get your connection string from console.neon.tech'
      );
    }
    
    sqlClient = neon(databaseUrl);
  }
  
  return sqlClient;
}

/**
 * Helper para ejecutar queries con parámetros usando tagged template
 * Neon requiere usar el sql como tagged template, no como función convencional
 */
export async function query<T = Record<string, unknown>>(
  sqlText: string,
  params: unknown[] = []
): Promise<T[]> {
  const sql = getDb();
  
  // Si no hay parámetros, podemos usar el sql directamente como string
  if (params.length === 0) {
    // Para queries sin parámetros, usar template literal directamente
    const result = await sql`${sqlText}` as unknown[];
    return result as T[];
  }
  
  // Para queries con parámetros, necesitamos construir un query dinámico
  // Usamos sql.query() que acepta la sintaxis tradicional $1, $2, etc.
  // Pero la API de neon no tiene .query() directamente
  
  // Alternativa: usar la función sql() con la query como string raw
  // Construimos la consulta manualmente reemplazando los placeholders
  const result = await executeWithParams<T>(sql, sqlText, params);
  return result;
}

/**
 * Ejecuta una query con parámetros usando interpolación segura
 */
async function executeWithParams<T>(
  sql: ReturnType<typeof neon>,
  queryText: string,
  params: unknown[]
): Promise<T[]> {
  // Para Neon serverless, usamos la función directamente con el query
  // La API requiere usar tagged templates, así que construimos
  // un template strings array manualmente
  
  // Dividimos el query por los placeholders $1, $2, etc.
  const parts = queryText.split(/\$(\d+)/);
  const strings: string[] = [];
  const values: unknown[] = [];
  
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Es texto literal
      strings.push(parts[i]);
    } else {
      // Es un índice de parámetro
      const paramIndex = parseInt(parts[i], 10) - 1;
      values.push(params[paramIndex]);
    }
  }
  
  // Crear el TemplateStringsArray
  const templateStrings = Object.assign([...strings], { raw: [...strings] }) as TemplateStringsArray;
  
  // Ejecutar con el tagged template
  const result = await sql(templateStrings, ...values);
  return result as T[];
}

// Helper para ejecutar una query que retorna una fila
export async function queryOne<T = Record<string, unknown>>(
  sqlText: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sqlText, params);
  return rows[0] ?? null;
}

// Helper para INSERT/UPDATE/DELETE que retorna affected rows
export async function execute(
  sqlText: string,
  params: unknown[] = []
): Promise<number> {
  const result = await query(sqlText, params);
  return Array.isArray(result) ? result.length : 0;
}

// Log de debug (solo en desarrollo)
export function logQuery(sqlText: string, params: unknown[] = []) {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[DB Query]', sqlText.substring(0, 100), 'params:', params.length);
  }
}
