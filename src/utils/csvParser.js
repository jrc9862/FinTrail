const fs = require('fs');
const csv = require('csv-parse/sync');
const path = require('path');

// Known CSV formats
const FORMATS = {
    FORMAT_3: {
        headers: ['Status', 'Date', 'Description', 'Debit', 'Credit'],
        dateFormat: 'MM/DD/YYYY'
    },
    FORMAT_4: {
        headers: ['Date', 'Description', 'Amount', 'Running Bal.'],
        skipRows: 6,
        dateFormat: 'MM/DD/YYYY'
    }
};

// Helper function to detect date format
function detectDateFormat(dateStr) {
    if (dateStr.includes('/')) {
        return 'MM/DD/YYYY';
    } else if (dateStr.includes('-')) {
        return 'YYYY-MM-DD';
    }
    return 'YYYY-MM-DD'; // Default format
}

// Helper function to parse date
function parseDate(dateStr, format) {
    if (!dateStr) return null;
    
    const [month, day, year] = dateStr.split('/').map(num => parseInt(num, 10));
    if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
    
    const date = new Date(year, month - 1, day);
    return date.toISOString().split('T')[0];
}

// Helper function to clean amount
function cleanAmount(amount) {
    // Remove currency symbols and commas
    const cleaned = amount.replace(/[$,]/g, '');
    // Convert to number
    return parseFloat(cleaned);
}

// Helper function to detect CSV format
function detectFormat(headers) {
    for (const [formatName, format] of Object.entries(FORMATS)) {
        if (format.headers.every(header => headers.includes(header))) {
            return formatName;
        }
    }
    return null;
}

// Helper function to extract vendor name from description
function extractVendor(description) {
    // Remove common prefixes and suffixes
    let vendor = description
        .replace(/^POS\s+/i, '')
        .replace(/^PURCHASE\s+/i, '')
        .replace(/^DEBIT\s+/i, '')
        .replace(/\s+PURCHASE$/i, '')
        .replace(/\s+DEBIT$/i, '')
        .trim();

    // Remove transaction IDs and dates
    vendor = vendor.replace(/\d{2}\/\d{2}\/\d{2,4}/g, '');
    vendor = vendor.replace(/\d{2}-\d{2}-\d{2,4}/g, '');
    vendor = vendor.replace(/\d{16,}/g, ''); // Remove long numbers (like card numbers)

    // Clean up extra spaces
    vendor = vendor.replace(/\s+/g, ' ').trim();

    return vendor;
}

// Main CSV parsing function
async function parseCSV(filePath) {
    try {
        const fileContent = await fs.promises.readFile(filePath, 'utf-8');
        const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line);
        
        // Detect format
        let format = null;
        let startRow = 0;
        
        // Check for FORMAT_4 (with skip rows)
        if (lines.length > 6) {
            const headers = lines[6].split(',').map(h => h.trim());
            if (headers.every(h => FORMATS.FORMAT_4.headers.includes(h))) {
                format = FORMATS.FORMAT_4;
                startRow = format.skipRows;
            }
        }
        
        // Check for FORMAT_3
        if (!format) {
            const headers = lines[0].split(',').map(h => h.trim());
            if (headers.every(h => FORMATS.FORMAT_3.headers.includes(h))) {
                format = FORMATS.FORMAT_3;
            }
        }
        
        if (!format) {
            throw new Error('Unrecognized CSV format. Supported formats are: Status, Date, Description, Debit, Credit or Date, Description, Amount, Running Bal.');
        }
        
        // Parse transactions
        const transactions = [];
        for (let i = startRow + 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            if (values.length < format.headers.length) continue;
            
            let transaction = {};
            
            if (format === FORMATS.FORMAT_3) {
                transaction = {
                    date: parseDate(values[1], format.dateFormat),
                    vendor: values[2],
                    description: values[2],
                    amount: parseFloat(values[3] || -values[4] || 0)
                };
            } else if (format === FORMATS.FORMAT_4) {
                transaction = {
                    date: parseDate(values[0], format.dateFormat),
                    vendor: values[1],
                    description: values[1],
                    amount: parseFloat(values[2] || 0)
                };
            }
            
            if (transaction.date && !isNaN(transaction.amount)) {
                transactions.push(transaction);
            }
        }
        
        return {
            transactions,
            fileName: path.basename(filePath)
        };
    } catch (error) {
        console.error('Error parsing CSV:', error);
        throw error;
    }
}

module.exports = {
    parseCSV,
    FORMATS
}; 