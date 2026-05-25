import sqlite3 from 'sqlite3';
import pg from 'pg';
import path from 'path';
import fs from 'fs';

// Check if PostgreSQL DATABASE_URL is provided in the environment
const pgConnectionUri = process.env.DATABASE_URL;
const isPg = !!pgConnectionUri;

let sqliteConnection: sqlite3.Database | null = null;
let pgPoolConnection: pg.Pool | null = null;

// Initialize Postgres Client Pool if active
if (isPg) {
  console.log('[DB] DATABASE_URL detected. Activating cloud PostgreSQL adapter mode.');
  pgPoolConnection = new pg.Pool({
    connectionString: pgConnectionUri,
    ssl: pgConnectionUri.includes('localhost') ? false : { rejectUnauthorized: false }
  });
} else {
  console.log('[DB] No DATABASE_URL found. Running locally on persistent SQLite adapter mode.');
}

/**
 * Resolves local SQLite path for fallback
 */
const dbDir = path.resolve(process.cwd(), 'server/data');
const dbPath = path.join(dbDir, 'database.sqlite');

/**
 * Normalizes SQL queries and placeholders between SQLite and PostgreSQL databases.
 */
function translateQuery(query: string): string {
  if (!isPg) return query;
  
  // Replace SQLITE parameters with PG $1, $2, $3...
  let pgQuery = query;
  let index = 1;
  while (pgQuery.includes('?')) {
    pgQuery = pgQuery.replace('?', `$${index++}`);
  }
  
  // Replace SQLite specific autoincrement keywords with PG equivalent
  pgQuery = pgQuery.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
  
  // If the query is an INSERT and we are executing write commands, ensure it returns row details
  if (pgQuery.toUpperCase().startsWith('INSERT ') && !pgQuery.toUpperCase().includes('RETURNING')) {
    pgQuery += ' RETURNING id';
  }
  
  return pgQuery;
}

/**
 * Initializes tables in both environments
 */
let dbInitializedPromise: Promise<void> | null = null;

export function initializeSchema(): Promise<void> {
  if (dbInitializedPromise) return dbInitializedPromise;
  
  dbInitializedPromise = new Promise(async (resolve, reject) => {
    if (isPg) {
      try {
        const client = await pgPoolConnection!.connect();
        try {
          // Initialize PostgreSQL Tables
          await client.query(translateQuery(`
            CREATE TABLE IF NOT EXISTS meter_history (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              reference_number TEXT NOT NULL,
              timestamp TEXT NOT NULL,
              entered_reading INTEGER NOT NULL,
              consumed_units INTEGER NOT NULL
            )
          `));
          
          await client.query(translateQuery(`
            CREATE TABLE IF NOT EXISTS account_pin (
              reference_number TEXT PRIMARY KEY,
              pin_hash TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
          `));
          console.log('[DB] PostgreSQL schema initialized successfully.');
          resolve();
        } finally {
          client.release();
        }
      } catch (err: any) {
        console.error('[DB] PostgreSQL schema initialization failed:', err.message);
        reject(err);
      }
    } else {
      // Local SQLite Setup
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      sqliteConnection = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('[DB] Failed to open SQLite database:', err.message);
          sqliteConnection = null;
          return reject(err);
        }
        
        sqliteConnection!.run(`
          CREATE TABLE IF NOT EXISTS meter_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference_number TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            entered_reading INTEGER NOT NULL,
            consumed_units INTEGER NOT NULL
          )
        `, (schemaErr) => {
          if (schemaErr) {
            console.error('[DB] SQLite meter_history schema failed:', schemaErr.message);
            return reject(schemaErr);
          }
          
          sqliteConnection!.run(`
            CREATE TABLE IF NOT EXISTS account_pin (
              reference_number TEXT PRIMARY KEY,
              pin_hash TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
          `, (pinErr) => {
            if (pinErr) {
              console.error('[DB] SQLite account_pin schema failed:', pinErr.message);
              return reject(pinErr);
            }
            console.log('[DB] SQLite schema initialized successfully.');
            resolve();
          });
        });
      });
    }
  });
  
  return dbInitializedPromise;
}

/**
 * Async Wrapper to retrieve multiple records (SQL SELECT)
 */
export async function dbAll(query: string, params: any[] = []): Promise<any[]> {
  await initializeSchema();
  const sql = translateQuery(query);
  
  if (isPg) {
    const res = await pgPoolConnection!.query(sql, params);
    return res.rows || [];
  } else {
    return new Promise((resolve, reject) => {
      sqliteConnection!.all(query, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }
}

/**
 * Async Wrapper to execute data modifications (SQL INSERT/UPDATE/DELETE)
 */
export async function dbRun(query: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  await initializeSchema();
  const sql = translateQuery(query);
  
  if (isPg) {
    const res = await pgPoolConnection!.query(sql, params);
    let lastID = 0;
    if (res.rows && res.rows.length > 0 && res.rows[0].id !== undefined) {
      lastID = parseInt(res.rows[0].id) || 0;
    }
    return { lastID, changes: res.rowCount || 0 };
  } else {
    return new Promise((resolve, reject) => {
      sqliteConnection!.run(query, params, function(err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
}
