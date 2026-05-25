import axios from 'axios';
import * as cheerio from 'cheerio';
import qs from 'qs';

export interface ConsumerInfo {
    referenceNumber: string;
    consumerId: string;
    name: string;
    address: string;
    tariff: string;
    load: string;
    division: string;
    subDivision: string;
    feederName: string;
}

export interface BillDetails {
    billMonth: string;
    connectionDate: string;
    readingDate: string;
    issueDate: string;
    dueDate: string;
}

export interface MeterDetails {
    meterNo: string;
    previousReading: string;
    presentReading: string;
    unitsConsumed: string;
}

export interface ChargesBreakdown {
    costOfElectricity: string;
    electricityDuty: string;
    gst: string;
    fuelPriceAdjustment: string;
    fcSurcharge: string;
    qtrTariffAdj: string;
    tvFee: string;
}

export interface PaymentSummary {
    currentBill: string;
    arrears: string;
    payableWithinDue: string;
    payableAfterDueDetails: string;
    isPaid: boolean;
    amountPaid: string;
    paymentDate: string;
}

export interface BillData {
    consumerInfo: ConsumerInfo;
    billDetails: BillDetails;
    meterDetails: MeterDetails;
    chargesBreakdown: ChargesBreakdown;
    paymentSummary: PaymentSummary;
}

export interface BillResult {
    referenceNumber: string;
    status: 'success' | 'failed';
    data?: BillData;
    error?: string;
}

// Main function to fetch and parse HESCO bill
export async function fetchSingleBill(refNo: string): Promise<BillResult> {
    const formattedRefNo = refNo.replace(/[^0-9]/g, '');
    if (formattedRefNo.length < 10) {
        return {
            referenceNumber: refNo,
            status: 'failed',
            error: 'Reference number must be at least 10 digits.'
        };
    }

    const getUrl = 'https://bill.pitc.com.pk/hescobill';
    
    try {
        // Step 1: GET request to retrieve CSRF and session cookies
        const getResponse = await axios.get(getUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 15000
        });

        const setCookieHeaders = getResponse.headers['set-cookie'] || [];
        const cookieString = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');

        const $get = cheerio.load(getResponse.data);
        const viewState = $get('input#__VIEWSTATE').val() || '';
        const viewStateGenerator = $get('input#__VIEWSTATEGENERATOR').val() || '';
        const eventValidation = $get('input#__EVENTVALIDATION').val() || '';
        const requestVerificationToken = $get('input[name="__RequestVerificationToken"]').val() || '';

        // Step 2: POST request to fetch the actual bill
        const postResponse = await axios.post(getUrl, qs.stringify({
            '__EVENTTARGET': '',
            '__EVENTARGUMENT': '',
            '__LASTFOCUS': '',
            '__VIEWSTATE': viewState,
            '__VIEWSTATEGENERATOR': viewStateGenerator,
            '__EVENTVALIDATION': eventValidation,
            'rbSearchByList': 'refno',
            'searchTextBox': formattedRefNo,
            'ruCodeTextBox': '', // Default to U (empty value represents U)
            '__RequestVerificationToken': requestVerificationToken,
            'btnSearch': 'Search'
        }), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': getUrl,
                'Origin': 'https://bill.pitc.com.pk',
                'Cookie': cookieString
            },
            timeout: 15000
        });

        const $ = cheerio.load(postResponse.data);

        // Check if we are stuck on the search page (which means ref no is invalid)
        if ($('input#searchTextBox').length > 0 && !$('td:contains("NAME & ADDRESS")').length && !$('td:contains("Name & Address")').length) {
            const errorMsg = $('#RegularExpressionValidator2').text().trim() || $('#ua').text().trim() || 'Invalid reference number or bill not found.';
            return {
                referenceNumber: refNo,
                status: 'failed',
                error: errorMsg
            };
        }

        // --- Parsing Logic using Header-Search Strategy ---
        const rows: string[][] = [];
        $('tr').each((i, rowEl) => {
            const cells: string[] = [];
            $(rowEl).find('td, th').each((j, cellEl) => {
                cells.push($(cellEl).text().replace(/\s+/g, ' ').trim());
            });
            if (cells.length > 0) {
                rows.push(cells);
            }
        });

        // Initialize variables
        let nameAndAddress = "Not Found";
        let consumerName = "Not Found";
        let consumerAddress = "Not Found";
        let connectionDate = "Not Found";
        let billMonth = "Not Found";
        let readingDate = "Not Found";
        let issueDate = "Not Found";
        let dueDate = "Not Found";
        let consumerId = "Not Found";
        let tariff = "Not Found";
        let load = "Not Found";
        let division = "Not Found";
        let subDivision = "Not Found";
        let feederName = "Not Found";
        
        let meterNo = "Not Found";
        let previousReading = "Not Found";
        let presentReading = "Not Found";
        let unitsConsumed = "Not Found";

        let electricityDuty = "0";
        let costOfElectricity = "0";
        let tvFee = "0";
        let gst = "0";
        let fcSurcharge = "0";
        let fuelPriceAdjustment = "0";
        let qtrTariffAdj = "0";

        let currentBill = "0";
        let arrearAmount = "0";
        let payableWithinDue = "0";
        let payableAfterDue = "0";
        
        let isPaid = false;
        let amountPaid = "0";
        let paymentDate = "Not Found";

        // 1. Parse Name & Address from td containing "NAME & ADDRESS"
        $('td').each((i, el) => {
            const text = $(el).text().replace(/\s+/g, ' ').trim();
            if (text.startsWith("NAME & ADDRESS")) {
                nameAndAddress = text.replace("NAME & ADDRESS", "").trim();
                
                const parts = nameAndAddress.split(/(?:VIL|T A|NEAR|PLOT|HOUSE|STREET|ROAD)/i);
                consumerName = parts[0].trim();
                if (parts.length > 1) {
                    consumerAddress = nameAndAddress.replace(consumerName, "").trim();
                } else {
                    consumerAddress = nameAndAddress;
                }
            }
        });

        // 2. Scan rows for matches
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            
            // Connection Date, Bill Month, Reading Date, Issue Date, Due Date row
            if (row.includes('CONNECTION DATE') && row.includes('BILL MONTH') && i + 1 < rows.length) {
                const nextRow = rows[i + 1];
                connectionDate = nextRow[row.indexOf('CONNECTION DATE')] || connectionDate;
                billMonth = nextRow[row.indexOf('BILL MONTH')] || billMonth;
                readingDate = nextRow[row.indexOf('READING DATE')] || readingDate;
                issueDate = nextRow[row.indexOf('ISSUE DATE')] || issueDate;
                dueDate = nextRow[row.indexOf('DUE DATE')] || dueDate;
            }

            // Consumer ID, Tariff, Load row
            if (row.includes('CONSUMER ID') && row.includes('TARIFF') && i + 1 < rows.length) {
                const nextRow = rows[i + 1];
                consumerId = nextRow[row.indexOf('CONSUMER ID')] || consumerId;
                tariff = nextRow[row.indexOf('TARIFF')] || tariff;
                load = nextRow[row.indexOf('LOAD')] || load;
            }

            // Division & Sub-division
            if (row.includes('DIVISION') && row.length > 1) {
                division = row[1];
            }
            if (row.includes('SUB DIVISION') && row.length > 1) {
                subDivision = row[1];
            }
            if (row.includes('FEEDER NAME') && row.length > 1) {
                feederName = row[1];
            }

            // Meter details
            if (row.includes('METER NO') && row.includes('PREVIOUS READING') && i + 1 < rows.length) {
                const nextRow = rows[i + 1];
                meterNo = nextRow[row.indexOf('METER NO')] || meterNo;
                previousReading = nextRow[row.indexOf('PREVIOUS READING')] || previousReading;
                presentReading = nextRow[row.indexOf('PRESENT READING')] || presentReading;
                unitsConsumed = nextRow[row.indexOf('UNITS')] || unitsConsumed;
            }

            // Charges Breakdown
            if (row.includes('UNITS CONSUMED')) {
                const idx = row.indexOf('UNITS CONSUMED');
                if (idx !== -1 && idx + 1 < row.length) unitsConsumed = row[idx + 1];
                const dutyIdx = row.indexOf('ELECTRICITY DUTY');
                if (dutyIdx !== -1 && dutyIdx + 1 < row.length) electricityDuty = row[dutyIdx + 1];
            }
            if (row.includes('COST OF ELECTRICITY')) {
                const idx = row.indexOf('COST OF ELECTRICITY');
                if (idx !== -1 && idx + 1 < row.length) costOfElectricity = row[idx + 1];
                const tvIdx = row.indexOf('TV FEE');
                if (tvIdx !== -1 && tvIdx + 1 < row.length) tvFee = row[tvIdx + 1];
            }
            if (row.includes('GST')) {
                const idx = row.indexOf('GST');
                if (idx !== -1 && idx + 1 < row.length) gst = row[idx + 1];
            }
            if (row.includes('FUEL PRICE ADJUSTMENT')) {
                const idx = row.indexOf('FUEL PRICE ADJUSTMENT');
                if (idx !== -1 && idx + 1 < row.length) fuelPriceAdjustment = row[idx + 1];
            }
            if (row.includes('F.C SURCHARGE')) {
                const idx = row.indexOf('F.C SURCHARGE');
                if (idx !== -1 && idx + 1 < row.length) fcSurcharge = row[idx + 1];
            }
            if (row.includes('QTR TARRIF ADJ/DMC')) {
                const idx = row.indexOf('QTR TARRIF ADJ/DMC');
                if (idx !== -1 && idx + 1 < row.length) qtrTariffAdj = row[idx + 1];
            }

            // Totals
            if (row.includes('ARREAR/AGE')) {
                const idx = row.indexOf('ARREAR/AGE');
                if (idx !== -1 && idx + 1 < row.length) arrearAmount = row[idx + 1];
            }
            if (row.includes('CURRENT BILL')) {
                const idx = row.indexOf('CURRENT BILL');
                if (idx !== -1 && idx + 1 < row.length) currentBill = row[idx + 1];
            }
            if (row.includes('PAYABLE WITHIN DUE DATE')) {
                const idx = row.indexOf('PAYABLE WITHIN DUE DATE');
                if (idx !== -1 && idx + 1 < row.length) payableWithinDue = row[idx + 1];
            }

            // Extended Summary row (Row 81-82 style)
            if (row.includes('PAYABLE AFTER DUE DATE') && row.length > 4) {
                payableAfterDue = row[4]; // Contains "Till 18-MAY-26 1598 After 18-MAY-26 1658"
            }

            // Payment verification
            for (const cell of row) {
                if (cell.includes('Amount Paid:') && cell.includes('Payment Date:')) {
                    isPaid = true;
                    const paidMatch = cell.match(/Amount Paid:\s*([\d\.]+)/i);
                    const dateMatch = cell.match(/Payment Date:\s*([a-zA-Z0-9\-]+)/i);
                    if (paidMatch) amountPaid = paidMatch[1];
                    if (dateMatch) paymentDate = dateMatch[1];
                }
            }
        }

        return {
            referenceNumber: refNo,
            status: 'success',
            data: {
                consumerInfo: {
                    referenceNumber: formattedRefNo,
                    consumerId: consumerId,
                    name: consumerName,
                    address: consumerAddress,
                    tariff: tariff,
                    load: load + " kW",
                    division: division,
                    subDivision: subDivision,
                    feederName: feederName
                },
                billDetails: {
                    billMonth: billMonth,
                    connectionDate: connectionDate,
                    readingDate: readingDate,
                    issueDate: issueDate,
                    dueDate: dueDate
                },
                meterDetails: {
                    meterNo: meterNo,
                    previousReading: previousReading,
                    presentReading: presentReading,
                    unitsConsumed: unitsConsumed
                },
                chargesBreakdown: {
                    costOfElectricity: costOfElectricity,
                    electricityDuty: electricityDuty,
                    gst: gst,
                    fuelPriceAdjustment: fuelPriceAdjustment,
                    fcSurcharge: fcSurcharge,
                    qtrTariffAdj: qtrTariffAdj,
                    tvFee: tvFee
                },
                paymentSummary: {
                    currentBill: currentBill,
                    arrears: arrearAmount,
                    payableWithinDue: payableWithinDue,
                    payableAfterDueDetails: payableAfterDue,
                    isPaid: isPaid,
                    amountPaid: amountPaid,
                    paymentDate: paymentDate
                }
            }
        };

    } catch (error: any) {
        return {
            referenceNumber: refNo,
            status: 'failed',
            error: error.message
        };
    }
}
