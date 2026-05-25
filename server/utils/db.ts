import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// Resolve database storage directory
const dbDir = path.resolve(process.cwd(), 'server/data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'database.sqlite');

let dbConnection: sqlite3.Database | null = null;

/**
 * Connects to the SQLite database and initializes the schema if necessary.
 */
export function getDb(): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    if (dbConnection) {
      return resolve(dbConnection);
    }
    
    dbConnection = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Failed to open SQLite database:', err.message);
        dbConnection = null;
        return reject(err);
      }
      
      // Auto-initialize Schema Table
      dbConnection.run(`
        CREATE TABLE IF NOT EXISTS meter_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reference_number TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          entered_reading INTEGER NOT NULL,
          consumed_units INTEGER NOT NULL
        )
      `, (schemaErr) => {
        if (schemaErr) {
          console.error('SQLite schema initialization failed:', schemaErr.message);
          return reject(schemaErr);
        }
        
        // Initialize PIN Security Table
        dbConnection!.run(`
          CREATE TABLE IF NOT EXISTS account_pin (
            reference_number TEXT PRIMARY KEY,
            pin_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
          )
        `, (pinErr) => {
          if (pinErr) {
            console.error('SQLite account_pin schema initialization failed:', pinErr.message);
            return reject(pinErr);
          }
          resolve(dbConnection!);
        });
      });
    });
  });
}

/**
 * Async Wrapper to retrieve multiple records (SQL SELECT)
 */
export function dbAll(query: string, params: any[] = []): Promise<any[]> {
  return getDb().then(conn => {
    return new Promise((resolve, reject) => {
      conn.all(query, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  });
}

/**
 * Async Wrapper to execute data modifications (SQL INSERT/UPDATE/DELETE)
 */
export function dbRun(query: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  return getDb().then(conn => {
    return new Promise((resolve, reject) => {
      conn.run(query, params, function(err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  });
}
