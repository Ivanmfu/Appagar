/**
 * Script para ejecutar migraciones SQL en Neon
 * Uso: npx tsx scripts/migrate.ts
 */

import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';

const DATABASE_URL = process.env.DATABASE_URL || 
  'postgresql://neondb_owner:npg_C9Idbaj4ZDwK@ep-divine-sunset-abrul9qt-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require';

const sql = neon(DATABASE_URL);

// Lista ordenada de migraciones a ejecutar
const migrations = [
  '20241107_inicial.sql',
  '20241108_group_invites.sql',
  '20251216_neon_auth_migration.sql',
];

async function runMigration(filename: string) {
  const filepath = path.join(process.cwd(), 'supabase', 'migrations', filename);
  
  if (!fs.existsSync(filepath)) {
    console.log(`⚠️  Skipping ${filename} (file not found)`);
    return;
  }
  
  console.log(`📄 Running migration: ${filename}`);
  
  const content = fs.readFileSync(filepath, 'utf-8');
  
  // Dividir en statements individuales
  // Regex para dividir por ; pero ignorando ; dentro de funciones/DO blocks
  const statements: string[] = [];
  let current = '';
  let inBlock = 0;
  
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('--')) {
      continue;
    }
    
    current += line + '\n';
    
    // Track $$ blocks (functions, DO blocks)
    const dollarMatches = line.match(/\$\$/g);
    if (dollarMatches) {
      inBlock += dollarMatches.length;
      if (inBlock % 2 === 0) inBlock = 0;
    }
    
    // If we hit a semicolon and not in a block, it's end of statement
    if (trimmed.endsWith(';') && inBlock === 0) {
      statements.push(current.trim());
      current = '';
    }
  }
  
  // Add any remaining content
  if (current.trim()) {
    statements.push(current.trim());
  }
  
  console.log(`   Found ${statements.length} statements`);
  
  let success = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const stmt of statements) {
    if (!stmt || stmt === ';') continue;
    
    try {
      // Usar tagged template con raw SQL
      await sql.transaction([stmt]);
      success++;
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.includes('already exists') || 
          msg.includes('duplicate key') ||
          msg.includes('does not exist')) {
        skipped++;
      } else {
        failed++;
        console.log(`   ❌ Error in: ${stmt.substring(0, 60)}...`);
        console.log(`      ${msg}`);
      }
    }
  }
  
  console.log(`   ✅ Success: ${success}, ⏭️ Skipped: ${skipped}, ❌ Failed: ${failed}`);
}

async function main() {
  console.log('🚀 Starting Neon migrations...\n');
  console.log(`📍 Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}\n`);
  
  for (const migration of migrations) {
    await runMigration(migration);
    console.log('');
  }
  
  console.log('🎉 Migrations completed!\n');
  
  // Verificar tablas creadas
  console.log('📊 Verifying tables...');
  try {
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    console.log('Tables in database:');
    if (tables.length === 0) {
      console.log('   (no tables found)');
    } else {
      tables.forEach((t: any) => console.log(`   - ${t.table_name}`));
    }
  } catch (e) {
    console.log('   Could not list tables');
  }
}

main().catch(console.error);
