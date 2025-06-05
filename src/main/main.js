const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const dbOperations = require('../database/operations');
const fs = require('fs');

// Initialize the store for app settings
const store = new Store();

// Keep a global reference of the window object
let mainWindow;

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Handle any unhandled promise rejections
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

// Disable hardware acceleration
app.disableHardwareAcceleration();

function createWindow() {
    console.log('Starting window creation...');
    
    try {
        // Create the browser window with minimal features
        mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            show: true, // Show immediately
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        console.log('BrowserWindow created successfully');

        // Get the path to index.html
        const indexPath = path.join(__dirname, '../renderer/index.html');
        console.log('Index path:', indexPath);

        // Verify the file exists
        if (!fs.existsSync(indexPath)) {
            console.error('Index file not found at:', indexPath);
            app.quit();
            return;
        }
        console.log('Index file exists');

        // Load the index.html file
        console.log('Attempting to load index file...');
        mainWindow.loadFile(indexPath);

        // Open DevTools
        mainWindow.webContents.openDevTools();

        // Handle window errors
        mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('Window failed to load:', errorCode, errorDescription);
        });

        mainWindow.webContents.on('crashed', () => {
            console.error('Window crashed');
        });

        // Emitted when the window is closed
        mainWindow.on('closed', () => {
            console.log('Window closed');
            mainWindow = null;
        });

        console.log('Window creation completed');
    } catch (error) {
        console.error('Error in createWindow:', error);
        app.quit();
    }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
    console.log('App is ready, creating window...');
    createWindow();
}).catch((error) => {
    console.error('Error in app.whenReady():', error);
    app.quit();
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
    console.log('All windows closed');
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    console.log('App activated');
    if (mainWindow === null) {
        createWindow();
    }
});

// Handle app quit
app.on('quit', () => {
    console.log('App quitting');
});

// IPC Handlers

// File Operations
ipcMain.handle('get-file-path', (event, path) => {
    // For drag and drop files, we need to ensure we have the full path
    if (path) {
        return path;
    }
    return null;
});

ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'CSV Files', extensions: ['csv'] }
    ]
  });
  return result.filePaths;
});

// Settings
ipcMain.handle('save-settings', (event, settings) => {
  store.set('settings', settings);
  return true;
});

ipcMain.handle('load-settings', () => {
  return store.get('settings');
});

// Database Operations
ipcMain.handle('get-dashboard-data', async () => {
  try {
    return await dbOperations.getDashboardData();
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    throw error;
  }
});

ipcMain.handle('get-transactions', async (event, filters) => {
  try {
    return await dbOperations.getTransactions(filters);
  } catch (error) {
    console.error('Error getting transactions:', error);
    throw error;
  }
});

ipcMain.handle('get-categories', async () => {
  try {
    return await dbOperations.getCategories();
  } catch (error) {
    console.error('Error getting categories:', error);
    throw error;
  }
});

// Handle category deletion
ipcMain.handle('delete-category', async (event, categoryId) => {
    try {
        console.log('Deleting category:', categoryId); // Debug log
        
        // Delete the category
        const result = await dbOperations.deleteCategory(categoryId);
        console.log('Delete result:', result); // Debug log
        
        if (result.success) {
            console.log('Category deleted successfully:', categoryId);
            return { success: true };
        }
        
        return result;
    } catch (error) {
        console.error('Error deleting category:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('add-category', async (event, { name, parentId, color }) => {
    try {
        console.log('Main process received add-category request:', { name, parentId, color }); // Debug log
        
        // Validate input
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            console.error('Invalid category name:', name);
            return {
                success: false,
                error: 'Invalid category name'
            };
        }
        
        // Validate color format
        if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
            console.error('Invalid color format:', color);
            return {
                success: false,
                error: 'Invalid color format'
            };
        }
        
        // Add the category
        const result = await dbOperations.addCategory(name.trim(), parentId, color);
        console.log('Category added successfully:', result); // Debug log
        
        if (!result || !result.lastID) {
            console.error('Failed to get category ID from result:', result);
            return {
                success: false,
                error: 'Failed to create category'
            };
        }
        
        return {
            success: true,
            categoryId: result.lastID
        };
    } catch (error) {
        console.error('Error adding category:', error);
        return {
            success: false,
            error: error.message
        };
    }
});

ipcMain.handle('update-vendor-category', async (event, { vendorId, categoryId }) => {
  try {
    await dbOperations.updateVendorCategory(vendorId, categoryId);
    return { success: true };
  } catch (error) {
    console.error('Error updating vendor category:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('update-transaction', async (event, { id, categoryId, recurring }) => {
  try {
    await dbOperations.updateTransaction(id, categoryId, recurring);
    return { success: true };
  } catch (error) {
    console.error('Error updating transaction:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Import Operations
ipcMain.handle('import-file', async (event, filePath) => {
  try {
    // Validate file path
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path provided');
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error('File does not exist');
    }

    // Check if file is a CSV
    if (!filePath.toLowerCase().endsWith('.csv')) {
      throw new Error('File must be a CSV');
    }

    const result = await dbOperations.importCSVFile(filePath);
    
    // Check for uncategorized transactions
    const uncategorizedTransactions = await dbOperations.getUncategorizedTransactions();
    
    return {
      success: true,
      count: result.count,
      uncategorizedTransactions: uncategorizedTransactions
    };
  } catch (error) {
    console.error('Error importing file:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('update-category-color', async (event, { categoryId, color }) => {
  try {
    const result = await dbOperations.updateCategoryColor({ categoryId, color });
    return result;
  } catch (error) {
    console.error('Error updating category color:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Handle transaction deletion
ipcMain.handle('delete-transaction', async (event, transactionId) => {
    try {
        const result = await dbOperations.deleteTransaction(transactionId);
        return result;
    } catch (error) {
        console.error('Error deleting transaction:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('clear-all-data', async () => {
    try {
        await dbOperations.clearAllData();
        return { success: true };
    } catch (error) {
        console.error('Error clearing all data:', error);
        return { success: false, error: error.message };
    }
}); 