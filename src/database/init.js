const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// Get the user data directory
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'spending-tracker.db');

console.log('Database path:', dbPath);

// Ensure the directory exists
try {
    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
        console.log('Created user data directory:', userDataPath);
    }
} catch (error) {
    console.error('Error creating user data directory:', error);
    throw error;
}

// Helper function to run SQL queries with promises
function runQuery(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                console.error('Error running query:', err);
                reject(err);
                return;
            }
            resolve(this);
        });
    });
}

// Helper function to get all rows with promises
function getAllRows(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('Error getting rows:', err);
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

// Open database connection
function openDatabase() {
    return new Promise((resolve, reject) => {
        console.log('Opening database connection...');
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                reject(err);
                return;
            }
            console.log('Database connection opened successfully');
            
            // Enable foreign keys
            db.run('PRAGMA foreign_keys = ON', (err) => {
                if (err) {
                    console.error('Error enabling foreign keys:', err);
                    reject(err);
                    return;
                }
                console.log('Foreign keys enabled');
                resolve(db);
            });
        });
    });
}

// Initialize the database
async function initDatabase() {
    console.log('Initializing database...');
    const db = await openDatabase();
    
    try {
        // Create tables
        console.log('Creating tables...');
        
        // Create categories table
        await runQuery(db, `
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                parent_id INTEGER,
                color TEXT NOT NULL DEFAULT '#e0e0e0',
                FOREIGN KEY (parent_id) REFERENCES categories(id)
            )
        `);
        console.log('Categories table created');

        // Create vendors table
        await runQuery(db, `
            CREATE TABLE IF NOT EXISTS vendors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                category_id INTEGER,
                FOREIGN KEY (category_id) REFERENCES categories(id)
            )
        `);
        console.log('Vendors table created');

        // Create transactions table
        await runQuery(db, `
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                vendor_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                description TEXT,
                category_id INTEGER,
                recurring BOOLEAN DEFAULT 0,
                source_file TEXT,
                FOREIGN KEY (vendor_id) REFERENCES vendors(id),
                FOREIGN KEY (category_id) REFERENCES categories(id)
            )
        `);
        console.log('Transactions table created');

        // Create import_history table
        await runQuery(db, `
            CREATE TABLE IF NOT EXISTS import_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                import_date TEXT NOT NULL,
                transaction_count INTEGER NOT NULL
            )
        `);
        console.log('Import history table created');

        // Verify tables were created
        const tables = await getAllRows(db, "SELECT name FROM sqlite_master WHERE type='table'");
        console.log('Created tables:', tables.map(t => t.name));

        // Verify the color column exists and has the correct default
        const categoryInfo = await getAllRows(db, "PRAGMA table_info(categories)");
        console.log('Categories table info:', categoryInfo);

        // Check for any categories with null colors and update them
        const nullColorCategories = await getAllRows(db, "SELECT id, name FROM categories WHERE color IS NULL");
        if (nullColorCategories.length > 0) {
            console.log('Found categories with null colors:', nullColorCategories);
            for (const category of nullColorCategories) {
                await runQuery(db, "UPDATE categories SET color = '#e0e0e0' WHERE id = ?", [category.id]);
                console.log(`Updated color for category ${category.name} (${category.id})`);
            }
        }

        return db;
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
}

module.exports = {
    initDatabase,
    openDatabase,
    dbPath,
    runQuery,
    getAllRows
}; 