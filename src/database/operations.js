const { initDatabase, openDatabase, runQuery, getAllRows } = require('./init');
const { parseCSV } = require('../utils/csvParser');

let db;

// Initialize database connection
async function initializeDatabase() {
    try {
        db = await initDatabase();
        console.log('Database initialized successfully');
        
        // Verify tables exist
        const tables = await getAllRows(db, "SELECT name FROM sqlite_master WHERE type='table'");
        console.log('Available tables:', tables.map(t => t.name));
        
        // Verify categories table
        const categories = await getAllRows(db, "SELECT * FROM categories");
        console.log('Categories in database:', categories);
        
    } catch (err) {
        console.error('Failed to initialize database:', err);
        throw err;
    }
}

// Initialize the database when the module loads
initializeDatabase().catch(err => {
    console.error('Fatal error during database initialization:', err);
    process.exit(1);
});

// Helper function to get database connection
async function getDb() {
    if (!db) {
        db = await openDatabase();
    }
    return db;
}

// Helper function to run a query
async function runQueryWithDb(sql, params = []) {
    try {
        if (!db) {
            db = await openDatabase();
        }
        console.log('Executing query:', { sql, params }); // Debug log
        const result = await runQuery(db, sql, params);
        console.log('Query result:', result); // Debug log
        return result;
    } catch (error) {
        console.error('Error executing query:', error);
        throw error;
    }
}

// Helper function to get all rows
async function allQuery(sql, params = []) {
    if (!db) {
        db = await openDatabase();
    }
    return getAllRows(db, sql, params);
}

// Helper function to get a single row
async function getQuery(sql, params = []) {
    try {
        if (!db) {
            db = await openDatabase();
        }
        console.log('Executing getQuery:', { sql, params }); // Debug log
        const rows = await getAllRows(db, sql, params);
        console.log('getQuery result:', rows[0]); // Debug log
        return rows[0];
    } catch (error) {
        console.error('Error in getQuery:', error);
        throw error;
    }
}

// Transaction Operations
async function addTransaction(transaction) {
    const query = `
        INSERT INTO transactions (date, vendor_id, description, amount, category_id, recurring, source_file)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    return runQueryWithDb(query, [
        transaction.date,
        transaction.vendor_id,
        transaction.description,
        transaction.amount,
        transaction.category_id,
        transaction.recurring ? 1 : 0,
        transaction.source_file
    ]);
}

async function updateTransaction(transaction) {
    const db = await openDatabase();
    
    try {
        // Start transaction
        await db.exec('BEGIN TRANSACTION');

        // Update transaction
        await db.run(
            'UPDATE transactions SET category_id = ?, recurring = ? WHERE id = ?',
            [transaction.categoryId, transaction.recurring ? 1 : 0, transaction.id]
        );

        // Update vendor category mapping
        await db.run(
            'UPDATE vendors SET category_id = ? WHERE id = (SELECT vendor_id FROM transactions WHERE id = ?)',
            [transaction.categoryId, transaction.id]
        );

        // If this is the first transaction for this category, generate a color
        if (transaction.categoryId) {
            const category = await db.get('SELECT color FROM categories WHERE id = ?', [transaction.categoryId]);
            if (!category.color) {
                // Generate a random pastel color
                const hue = Math.floor(Math.random() * 360);
                const color = `hsl(${hue}, 70%, 80%)`;
                await db.run('UPDATE categories SET color = ? WHERE id = ?', [color, transaction.categoryId]);
            }
        }

        // Commit transaction
        await db.exec('COMMIT');
        return { success: true };
    } catch (error) {
        // Rollback on error
        await db.exec('ROLLBACK');
        console.error('Error updating transaction:', error);
        return { success: false, error: error.message };
    }
}

async function getTransactions(filters = {}) {
    let query = `
        SELECT 
            t.*,
            v.name as vendor_name,
            c.name as category_name
        FROM transactions t
        LEFT JOIN vendors v ON t.vendor_id = v.id
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE 1=1
    `;
    const params = [];

    if (filters.startDate) {
        query += ' AND t.date >= ?';
        params.push(filters.startDate);
    }

    if (filters.endDate) {
        query += ' AND t.date <= ?';
        params.push(filters.endDate);
    }

    if (filters.categoryId) {
        query += ' AND t.category_id = ?';
        params.push(filters.categoryId);
    }

    if (filters.vendorId) {
        query += ' AND t.vendor_id = ?';
        params.push(filters.vendorId);
    }

    if (filters.search) {
        query += ' AND (v.name LIKE ? OR t.description LIKE ?)';
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY t.date DESC';

    return allQuery(query, params);
}

// Vendor Operations
async function getOrCreateVendor(name) {
    const vendor = await getQuery('SELECT id FROM vendors WHERE name = ?', [name]);
    
    if (!vendor) {
        const result = await runQueryWithDb('INSERT INTO vendors (name) VALUES (?)', [name]);
        return result.lastID;
    }
    
    return vendor.id;
}

async function updateVendorCategory(vendorId, categoryId) {
    return runQueryWithDb('UPDATE vendors SET category_id = ? WHERE id = ?', [categoryId, vendorId]);
}

// Category Operations
async function getCategories() {
    try {
        console.log('Getting categories from database...'); // Debug log
        const query = `
            SELECT id, name, color 
            FROM categories 
            ORDER BY name
        `;
        const categories = await allQuery(query);
        console.log('Raw category data from database:', JSON.stringify(categories, null, 2)); // Debug log
        
        // Verify each category has the expected fields
        categories.forEach(category => {
            console.log(`Category ${category.id} (${category.name}):`, {
                hasId: 'id' in category,
                hasName: 'name' in category,
                hasColor: 'color' in category,
                colorValue: category.color
            });
        });
        
        return categories;
    } catch (error) {
        console.error('Error getting categories:', error);
        throw error;
    }
}

async function addCategory(name, parentId = null, color = '#e0e0e0') {
    console.log('Adding category with params:', { name, parentId, color }); // Debug log
    try {
        if (!db) {
            db = await openDatabase();
        }

        // First check if the category already exists
        const existingCategory = await getQuery('SELECT id FROM categories WHERE name = ?', [name]);
        if (existingCategory) {
            console.error('Category already exists:', name);
            throw new Error('Category with this name already exists');
        }

        // Validate color format
        if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
            console.error('Invalid color format:', color);
            throw new Error('Invalid color format');
        }

        const query = `
            INSERT INTO categories (name, parent_id, color)
            VALUES (?, ?, ?)
        `;
        console.log('Executing query:', { query, params: [name, parentId, color] }); // Debug log
        
        const result = await runQueryWithDb(query, [name, parentId, color]);
        console.log('Category added with result:', result); // Debug log
        
        return result;
    } catch (error) {
        console.error('Error adding category:', error);
        throw error;
    }
}

async function updateCategoryColor({ categoryId, color }) {
    try {
        console.log('Starting category color update:', { categoryId, color }); // Debug log
        
        // First verify the category exists
        const category = await getQuery('SELECT id, name, color FROM categories WHERE id = ?', [categoryId]);
        if (!category) {
            console.error('Category not found:', categoryId);
            return { success: false, error: 'Category not found' };
        }
        
        console.log('Current category state:', category); // Debug log
        
        // Update the color
        const updateResult = await runQueryWithDb('UPDATE categories SET color = ? WHERE id = ?', [color, categoryId]);
        console.log('Update result:', updateResult); // Debug log
        
        // Verify the update
        const updatedCategory = await getQuery('SELECT id, name, color FROM categories WHERE id = ?', [categoryId]);
        console.log('Updated category state:', updatedCategory); // Debug log
        
        if (!updatedCategory || updatedCategory.color !== color) {
            console.error('Color update verification failed:', { 
                expected: color, 
                actual: updatedCategory?.color,
                categoryId,
                categoryName: updatedCategory?.name
            });
            return { success: false, error: 'Color update verification failed' };
        }
        
        console.log('Category color update successful:', {
            categoryId,
            categoryName: updatedCategory.name,
            oldColor: category.color,
            newColor: color
        }); // Debug log
        return { success: true };
    } catch (error) {
        console.error('Error updating category color:', error);
        return { success: false, error: error.message };
    }
}

// Import Operations
async function recordImport(fileName, rowCount) {
    const query = `
        INSERT INTO imports (file_name, import_date, row_count)
        VALUES (?, datetime('now'), ?)
    `;
    return runQueryWithDb(query, [fileName, rowCount]);
}

// Dashboard Data
async function getDashboardData() {
    // Get monthly spending data
    const monthlyData = await allQuery(`
        SELECT 
            strftime('%Y-%m', date) as month,
            SUM(CASE WHEN recurring = 1 THEN amount ELSE 0 END) as recurring_amount,
            SUM(CASE WHEN recurring = 0 THEN amount ELSE 0 END) as non_recurring_amount
        FROM transactions
        WHERE date >= date('now', '-12 months')
        GROUP BY month
        ORDER BY month
    `);

    // Get category breakdown
    const categoryData = await allQuery(`
        SELECT 
            c.name as category,
            SUM(t.amount) as total,
            COUNT(CASE WHEN t.recurring = 1 THEN 1 END) as recurring_count
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.date >= date('now', '-30 days')
        GROUP BY c.id
        ORDER BY total DESC
    `);

    // Get recent transactions
    const recentTransactions = await allQuery(`
        SELECT 
            t.date,
            v.name as vendor,
            t.amount,
            t.description,
            t.recurring,
            c.name as category
        FROM transactions t
        JOIN vendors v ON t.vendor_id = v.id
        LEFT JOIN categories c ON t.category_id = c.id
        ORDER BY t.date DESC
        LIMIT 10
    `);

    // MoM Spending by Category (last 12 months)
    // 1. Get all months in the last 12 months
    const monthsRows = await allQuery(`
        SELECT DISTINCT strftime('%Y-%m', date) as month
        FROM transactions
        WHERE date >= date('now', '-12 months')
        ORDER BY month
    `);
    const months = monthsRows.map(r => r.month);

    // 2. Get all categories
    const categoriesRows = await allQuery(`
        SELECT id, name FROM categories ORDER BY name
    `);
    const categories = categoriesRows.map(r => r.name);

    // 3. Get sum(amount) for each (month, category)
    const momRows = await allQuery(`
        SELECT 
            strftime('%Y-%m', t.date) as month,
            c.name as category,
            SUM(t.amount) as total
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.date >= date('now', '-12 months')
        GROUP BY month, c.id
    `);

    // 4. Build data structure
    const data = {};
    categories.forEach(cat => {
        data[cat] = months.map(() => 0);
    });
    momRows.forEach(row => {
        const catIdx = categories.indexOf(row.category);
        const monthIdx = months.indexOf(row.month);
        if (catIdx !== -1 && monthIdx !== -1) {
            data[row.category][monthIdx] = row.total;
        }
    });

    return {
        monthly: {
            labels: monthlyData.map(d => d.month),
            recurring: monthlyData.map(d => d.recurring_amount),
            nonRecurring: monthlyData.map(d => d.non_recurring_amount)
        },
        categories: {
            labels: categoryData.map(d => d.category),
            values: categoryData.map(d => d.total),
            recurring: categoryData.map(d => d.recurring_count)
        },
        recentTransactions,
        momByCategory: {
            months,
            categories,
            data
        }
    };
}

// Check for duplicate transaction
async function isDuplicateTransaction(transaction) {
    const query = `
        SELECT t.id FROM transactions t
        JOIN vendors v ON t.vendor_id = v.id
        WHERE t.date = ? 
        AND v.name = ?
        AND t.description = ?
        AND t.amount = ?
    `;
    
    const result = await getQuery(query, [
        transaction.date,
        transaction.vendor,
        transaction.description,
        transaction.amount
    ]);
    
    return result !== undefined;
}

// CSV Import Handler
async function importCSVFile(filePath) {
    const { transactions, fileName } = await parseCSV(filePath);
    let importedCount = 0;
    let duplicateCount = 0;
    let uncategorizedVendors = new Set();

    for (const transaction of transactions) {
        // Check for duplicates
        if (await isDuplicateTransaction(transaction)) {
            duplicateCount++;
            continue;
        }

        // Get or create vendor
        const vendorId = await getOrCreateVendor(transaction.vendor);

        // Check if vendor has a default category
        const vendor = await getQuery('SELECT category_id FROM vendors WHERE id = ?', [vendorId]);
        
        // Add transaction
        await addTransaction({
            date: transaction.date,
            vendor_id: vendorId,
            description: transaction.description,
            amount: transaction.amount,
            category_id: vendor?.category_id || null,
            recurring: false,
            source_file: fileName
        });

        // If vendor has no category, add to uncategorized set
        if (!vendor?.category_id) {
            uncategorizedVendors.add(vendorId);
        }

        importedCount++;
    }

    // Record import
    await recordImport(fileName, importedCount);

    return {
        count: importedCount,
        duplicates: duplicateCount,
        uncategorizedVendors: Array.from(uncategorizedVendors)
    };
}

async function getUncategorizedTransactions() {
    const query = `
        SELECT t.*, v.name as vendor_name
        FROM transactions t
        JOIN vendors v ON t.vendor_id = v.id
        WHERE t.category_id IS NULL
        ORDER BY t.date DESC
    `;
    
    return allQuery(query);
}

// Delete transaction
async function deleteTransaction(transactionId) {
    try {
        const database = await getDb();
        await database.run('DELETE FROM transactions WHERE id = ?', [transactionId]);
        return { success: true };
    } catch (error) {
        console.error('Error deleting transaction:', error);
        return { success: false, error: error.message };
    }
}

// Delete category
async function deleteCategory(categoryId) {
    const db = await openDatabase();
    
    try {
        // Start transaction
        await db.exec('BEGIN TRANSACTION');

        // Remove category from transactions
        await db.run('UPDATE transactions SET category_id = NULL WHERE category_id = ?', [categoryId]);
        
        // Remove category from vendors
        await db.run('UPDATE vendors SET category_id = NULL WHERE category_id = ?', [categoryId]);
        
        // Delete the category
        await db.run('DELETE FROM categories WHERE id = ?', [categoryId]);

        // Commit transaction
        await db.exec('COMMIT');
        return { success: true };
    } catch (error) {
        // Rollback on error
        await db.exec('ROLLBACK');
        console.error('Error deleting category:', error);
        return { success: false, error: error.message };
    }
}

async function clearAllData() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            
            // Delete all data from tables
            db.run('DELETE FROM transactions', (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    reject(err);
                    return;
                }
            });
            
            db.run('DELETE FROM categories', (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    reject(err);
                    return;
                }
            });
            
            // Reset autoincrement counters
            db.run('DELETE FROM sqlite_sequence WHERE name IN ("transactions", "categories")', (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    reject(err);
                    return;
                }
            });
            
            db.run('COMMIT', (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    });
}

module.exports = {
    addTransaction,
    updateTransaction,
    getTransactions,
    getOrCreateVendor,
    updateVendorCategory,
    getCategories,
    addCategory,
    updateCategoryColor,
    recordImport,
    getDashboardData,
    importCSVFile,
    getUncategorizedTransactions,
    deleteTransaction,
    deleteCategory,
    clearAllData,
    getQuery,
    allQuery,
    runQueryWithDb
}; 