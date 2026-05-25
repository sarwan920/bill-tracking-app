import { defineEventHandler, readBody, getQuery, createError } from 'h3';
import { dbAll, dbRun } from '../utils/db';
import crypto from 'crypto';

/**
 * Computes a secure SHA-256 hash of a PIN.
 */
function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

/**
 * Verifies that the correct PIN is provided if a PIN is registered in SQLite.
 */
async function verifyPinAccess(refNo: string, enteredPin: any) {
  const cleanedRef = String(refNo).replace(/[^0-9]/g, '');
  
  const records = await dbAll('SELECT pin_hash FROM account_pin WHERE reference_number = ?', [cleanedRef]);
  if (records.length > 0) {
    if (!enteredPin) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Security PIN is required to access these records.'
      });
    }
    const hash = hashPin(String(enteredPin).trim());
    if (records[0].pin_hash !== hash) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Incorrect security PIN. Access denied.'
      });
    }
  }
}

export default defineEventHandler(async (event) => {
  const method = event.node.req.method;

  // --- GET METHOD: Retrieve History per Reference Number (Secured) ---
  if (method === 'GET') {
    const query = getQuery(event);
    const ref = query.ref as string;
    const pin = query.pin as string; // Optional: Required only if PIN is configured
    
    if (!ref) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing consumer reference number query parameter.'
      });
    }

    try {
      // Validate PIN before returning SQLite history records
      await verifyPinAccess(ref, pin);

      const rows = await dbAll(
        'SELECT id, timestamp, entered_reading as enteredReading, consumed_units as consumedUnits FROM meter_history WHERE reference_number = ? ORDER BY id DESC',
        [ref]
      );
      return rows;
    } catch (err: any) {
      throw createError({
        statusCode: err.statusCode || 500,
        statusMessage: err.statusMessage || `Database query error: ${err.message}`
      });
    }
  }

  // --- POST METHOD: Log a new Reading Checkpoint (Secured) ---
  if (method === 'POST') {
    const body = await readBody(event);
    const { referenceNumber, enteredReading, presentReading, pin } = body;

    if (!referenceNumber || enteredReading === undefined || presentReading === undefined) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Required body fields missing: referenceNumber, enteredReading, presentReading.'
      });
    }

    try {
      // Enforce security validation check
      await verifyPinAccess(referenceNumber, pin);

      const current = parseInt(enteredReading);
      const present = parseInt(presentReading);

      if (isNaN(current) || isNaN(present)) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Reading metrics must be valid numeric values.'
        });
      }

      if (current < present) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Entered meter reading cannot be lower than the bill present reading.'
        });
      }

      const consumed = current - present;

      // Generate localized timestamp on server
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const month = months[now.getMonth()];
      const year = String(now.getFullYear()).slice(-2);
      
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timestamp = `${day}-${month}-${year} ${hours}:${minutes}`;

      const result = await dbRun(
        'INSERT INTO meter_history (reference_number, timestamp, entered_reading, consumed_units) VALUES (?, ?, ?, ?)',
        [referenceNumber, timestamp, current, consumed]
      );
      
      return {
        id: result.lastID,
        timestamp,
        enteredReading: current,
        consumedUnits: consumed
      };
    } catch (err: any) {
      throw createError({
        statusCode: err.statusCode || 500,
        statusMessage: err.statusMessage || `Database write failure: ${err.message}`
      });
    }
  }

  // --- DELETE METHOD: Purge a Log Checkpoint (Secured) ---
  if (method === 'DELETE') {
    const body = await readBody(event);
    const { id, referenceNumber, pin } = body;

    if (id === undefined || !referenceNumber) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Required body fields missing: id, referenceNumber.'
      });
    }

    try {
      // Verify security validation check before purging SQLite row
      await verifyPinAccess(referenceNumber, pin);

      const result = await dbRun('DELETE FROM meter_history WHERE id = ?', [id]);
      if (result.changes === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Log record not found for the provided id.'
        });
      }
      return { success: true };
    } catch (err: any) {
      throw createError({
        statusCode: err.statusCode || 500,
        statusMessage: err.statusMessage || `Database purge failure: ${err.message}`
      });
    }
  }

  // HTTP Method Guard
  throw createError({
    statusCode: 405,
    statusMessage: 'HTTP Method Not Allowed.'
  });
});
