import { defineEventHandler, readBody, createError } from 'h3';
import { fetchSingleBill, BillResult } from '../utils/scraper';
import { dbAll } from '../utils/db';

// Promise timeout utility to prevent request hangs when HESCO gateway stalls
const withTimeout = <T>(promise: Promise<T>, ms: number, defaultValue: T): Promise<T> => {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => {
            resolve(defaultValue);
        }, ms);
    });
    return Promise.race([promise, timeoutPromise]).then((result) => {
        clearTimeout(timeoutId);
        return result;
    });
};

export default defineEventHandler(async (event) => {
    const body = await readBody(event);
    
    if (!body || !body.referenceNumbers || !Array.isArray(body.referenceNumbers)) {
        throw createError({
            statusCode: 400,
            statusMessage: "Please provide an array of reference numbers under the 'referenceNumbers' key."
        });
    }

    const { referenceNumbers } = body;

    if (referenceNumbers.length === 0) {
        throw createError({
            statusCode: 400,
            statusMessage: "Reference numbers array cannot be empty."
        });
    }

    // Limit maximum concurrent queries to 10 to protect HESCO server stability
    if (referenceNumbers.length > 10) {
        throw createError({
            statusCode: 400,
            statusMessage: "Maximum of 10 reference numbers can be queried at once."
        });
    }

    console.log(`[API] Received bulk request for: [${referenceNumbers.join(', ')}]`);

    try {
        // Fire off all requests concurrently with a strict 18-second timeout
        const billPromises = referenceNumbers.map((refNo: string) => 
            withTimeout<BillResult>(
                fetchSingleBill(refNo),
                18000,
                {
                    referenceNumber: refNo,
                    status: 'failed',
                    error: 'The official HESCO database took too long to respond. Please try again.'
                }
            )
        );
        const results = await Promise.all(billPromises);
        
        // Query SQLite to check if a PIN is configured for each queried reference number
        try {
            const cleanedRefs = referenceNumbers.map((ref: string) => ref.replace(/[^0-9]/g, ''));
            const placeholders = cleanedRefs.map(() => '?').join(',');
            const pins = await dbAll(
                `SELECT reference_number FROM account_pin WHERE reference_number IN (${placeholders})`,
                cleanedRefs
            );
            const securedRefs = new Set(pins.map(row => row.reference_number));

            return results.map(res => {
                const cleaned = String(res.referenceNumber).replace(/[^0-9]/g, '');
                return {
                    ...res,
                    hasPin: securedRefs.has(cleaned)
                };
            });
        } catch (dbErr) {
            console.error("[API] Failed to query account PIN status:", dbErr);
            // Failsafe: return default hasPin: false if DB queries fail
            return results.map(res => ({ ...res, hasPin: false }));
        }
    } catch (error: any) {
        console.error("[API] Bulk fetch error:", error);
        throw createError({
            statusCode: 500,
            statusMessage: "Internal server error occurred while fetching bills."
        });
    }
});
