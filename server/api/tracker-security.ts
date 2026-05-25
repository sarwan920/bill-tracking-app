import { defineEventHandler, readBody, createError } from 'h3';
import { dbAll, dbRun } from '../utils/db';
import crypto from 'crypto';

/**
 * Computes a secure SHA-256 hash of a PIN.
 */
function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

export default defineEventHandler(async (event) => {
  const method = event.node.req.method;

  if (method !== 'POST') {
    throw createError({
      statusCode: 405,
      statusMessage: 'HTTP Method Not Allowed.'
    });
  }

  const body = await readBody(event);
  const { action, referenceNumber, pin } = body;

  if (!action || !referenceNumber || !pin) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required body fields: action, referenceNumber, pin.'
    });
  }

  const cleanedRef = String(referenceNumber).replace(/[^0-9]/g, '');
  const cleanedPin = String(pin).trim();

  if (cleanedPin === 'undefined' || cleanedPin === '') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid security PIN provided.'
    });
  }

  if (cleanedPin.length < 4) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Security PIN must be at least 4 characters long.'
    });
  }

  const pinHash = hashPin(cleanedPin);

  // --- ACTION: setup a new PIN ---
  if (action === 'setup') {
    try {
      // Check if a PIN is already configured
      const existing = await dbAll('SELECT reference_number FROM account_pin WHERE reference_number = ?', [cleanedRef]);
      if (existing.length > 0) {
        throw createError({
          statusCode: 409,
          statusMessage: 'A security PIN has already been set up for this reference number.'
        });
      }

      const timestamp = new Date().toISOString();
      await dbRun(
        'INSERT INTO account_pin (reference_number, pin_hash, created_at) VALUES (?, ?, ?)',
        [cleanedRef, pinHash, timestamp]
      );

      return { success: true, message: 'Security PIN configured successfully.' };
    } catch (err: any) {
      throw createError({
        statusCode: err.statusCode || 500,
        statusMessage: err.statusMessage || `Failed to setup PIN: ${err.message}`
      });
    }
  }

  // --- ACTION: verify an entered PIN ---
  if (action === 'verify') {
    try {
      const records = await dbAll('SELECT pin_hash FROM account_pin WHERE reference_number = ?', [cleanedRef]);
      if (records.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: 'No security PIN has been set up for this reference number.'
        });
      }

      const matched = (records[0].pin_hash === pinHash);
      if (!matched) {
        throw createError({
          statusCode: 401,
          statusMessage: 'Incorrect security PIN. Access denied.'
        });
      }

      return { success: true, message: 'PIN verified successfully.' };
    } catch (err: any) {
      throw createError({
        statusCode: err.statusCode || 500,
        statusMessage: err.statusMessage || `Failed to verify PIN: ${err.message}`
      });
    }
  }

  // Invalid Action
  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid action parameter. Must be "setup" or "verify".'
  });
});
