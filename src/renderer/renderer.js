const { ipcRenderer } = require('electron');
const Chart = require('chart.js/auto');

// DOM Elements
const views = {
    dashboard: document.getElementById('dashboard-view'),
    transactions: document.getElementById('transactions-view'),
    import: document.getElementById('import-view'),
    settings: document.getElementById('settings-view')
};

const navButtons = document.querySelectorAll('.nav-btn');
const dropZone = document.getElementById('drop-zone');
const selectFilesBtn = document.getElementById('select-files');
const importProgress = document.getElementById('import-progress');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const themeSelect = document.getElementById('theme-select');
const categoryFilter = document.getElementById('category-filter');
const dateFilter = document.getElementById('date-filter');
const transactionSearch = document.getElementById('transaction-search');
const minAmountInput = document.getElementById('min-amount');
const maxAmountInput = document.getElementById('max-amount');
const applyAmountFilterBtn = document.getElementById('apply-amount-filter');
const clearAmountFilterBtn = document.getElementById('clear-amount-filter');

// Verify required elements
function verifyElements() {
    const requiredElements = {
        views,
        navButtons,
        dropZone,
        selectFilesBtn,
        importProgress,
        progressBar,
        progressText,
        themeSelect,
        categoryFilter,
        dateFilter,
        transactionSearch,
        minAmountInput,
        maxAmountInput,
        applyAmountFilterBtn,
        clearAmountFilterBtn
    };

    for (const [name, element] of Object.entries(requiredElements)) {
        if (!element) {
            console.error(`Required element not found: ${name}`);
        }
    }
}

// Charts
let momCategoryChart, categoryBreakdownChart;

// Categorization Modal
const modal = document.getElementById('categorization-modal');
const modalDate = document.getElementById('modal-date');
const modalVendor = document.getElementById('modal-vendor');
const modalAmount = document.getElementById('modal-amount');
const modalDescription = document.getElementById('modal-description');
const categorySelect = document.getElementById('category-select');
const recurringToggle = document.getElementById('recurring-toggle');
const saveCategorizationBtn = document.getElementById('save-categorization');
const cancelCategorizationBtn = document.getElementById('cancel-categorization');
const newCategoryBtn = document.getElementById('new-category');

let currentTransaction = null;
let pendingTransactions = [];

// Add notification container to the DOM
const notificationContainer = document.createElement('div');
notificationContainer.className = 'notification-container';
document.body.appendChild(notificationContainer);

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notificationContainer.appendChild(notification);

    // Remove notification after animation
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Initialize the application
async function init() {
    // Verify all required elements are present
    verifyElements();

    // Load settings
    const settings = await ipcRenderer.invoke('load-settings');
    if (settings && settings.theme) {
        document.documentElement.setAttribute('data-theme', settings.theme);
        themeSelect.value = settings.theme;
    }

    // Initialize charts
    initCharts();

    // Load initial data
    await loadDashboardData();
    await loadTransactions();
    await loadCategories();

    // Set up event listeners
    setupEventListeners();

    // Show initial view
    showView('dashboard');
}

// Navigation
function setupEventListeners() {
    // Navigation buttons
    navButtons.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                showView(btn.dataset.view);
            });
        }
    });

    // Import handlers
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            
            const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'));
            if (files.length > 0) {
                const filePaths = await Promise.all(files.map(async (file) => {
                    const result = await ipcRenderer.invoke('get-file-path', file.path);
                    return result;
                }));
                await importFiles(filePaths);
            }
        });
    }

    if (selectFilesBtn) {
        selectFilesBtn.addEventListener('click', async () => {
            const filePaths = await ipcRenderer.invoke('select-files');
            if (filePaths && filePaths.length > 0) {
                await importFiles(filePaths);
            }
        });
    }

    // Filter handlers
    if (categoryFilter) {
        categoryFilter.addEventListener('change', loadTransactions);
    }
    if (dateFilter) {
        dateFilter.addEventListener('change', loadTransactions);
    }
    if (transactionSearch) {
        transactionSearch.addEventListener('input', debounce(loadTransactions, 300));
    }

    // Settings handlers
    if (themeSelect) {
        themeSelect.addEventListener('change', async (e) => {
            const theme = e.target.value;
            document.documentElement.setAttribute('data-theme', theme);
            await ipcRenderer.invoke('save-settings', { theme });
            updateChartColors();
            // Reload categories to update color swatches
            if (views.settings && !views.settings.classList.contains('hidden')) {
                loadCategories();
            }
        });
    }

    // Add category button in settings
    const addCategoryBtn = document.getElementById('add-category-btn');
    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', handleNewCategory);
    }

    // Categorization handlers
    if (newCategoryBtn) {
        newCategoryBtn.addEventListener('click', handleNewCategory);
    }
    if (saveCategorizationBtn) {
        saveCategorizationBtn.addEventListener('click', handleCategorizationSave);
    }
    if (cancelCategorizationBtn) {
        cancelCategorizationBtn.addEventListener('click', hideCategorizationModal);
    }

    // Amount filter handlers
    if (applyAmountFilterBtn) {
        applyAmountFilterBtn.addEventListener('click', () => {
            const minAmount = parseFloat(minAmountInput.value) || -Infinity;
            const maxAmount = parseFloat(maxAmountInput.value) || Infinity;
            filterRecentTransactions(minAmount, maxAmount);
        });
    }

    if (clearAmountFilterBtn) {
        clearAmountFilterBtn.addEventListener('click', () => {
            minAmountInput.value = '';
            maxAmountInput.value = '';
            loadDashboardData();
        });
    }
}

function showView(viewId) {
    // Hide all views
    Object.values(views).forEach(view => {
        if (view) {
            view.classList.add('hidden');
        }
    });

    // Show selected view
    const selectedView = views[viewId];
    if (selectedView) {
        selectedView.classList.remove('hidden');
    }

    // Update active nav button
    navButtons.forEach(btn => {
        if (btn) {
            if (btn.dataset.view === viewId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });

    // Load view-specific data
    switch (viewId) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'transactions':
            loadTransactions();
            break;
        case 'settings':
            loadCategories();
            break;
    }

    // Update chart colors whenever view changes
    updateChartColors();
}

// Dashboard
function initCharts() {
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDarkMode ? '#FFFFFF' : '#212121';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    // MoM Spending by Category (Stacked Area Chart)
    const momCategoryCanvas = document.getElementById('mom-category-chart');
    if (!momCategoryCanvas) {
        console.error('Canvas element for MoM category chart not found.');
        return;
    }
    const momCategoryCtx = momCategoryCanvas.getContext('2d');
    momCategoryChart = new Chart(momCategoryCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: textColor,
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${formatAmount(context.parsed.y)}`;
                        }
                    }
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { 
                        display: true,
                        color: gridColor
                    },
                    ticks: { 
                        color: textColor
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: { 
                        display: true,
                        color: gridColor
                    },
                    ticks: {
                        callback: value => formatAmount(value),
                        color: textColor
                    }
                }
            }
        }
    });

    // Initialize Category Breakdown Chart
    const categoryCanvas = document.getElementById('category-breakdown-chart');
    if (!categoryCanvas) {
        console.error('Canvas element for category breakdown chart not found.');
        return;
    }
    const categoryCtx = categoryCanvas.getContext('2d');
    categoryBreakdownChart = new Chart(categoryCtx, {
        type: 'pie',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    '#2196F3', '#4CAF50', '#FFC107', '#F44336', '#9C27B0',
                    '#00BCD4', '#FF9800', '#795548', '#607D8B', '#E91E63'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: textColor,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            return `${context.label}: ${formatAmount(value)}`;
                        }
                    }
                }
            }
        }
    });
}

async function loadDashboardData() {
    try {
        const data = await ipcRenderer.invoke('get-dashboard-data');

        // Update MoM Category Chart
        if (data.momByCategory && data.momByCategory.months && data.momByCategory.categories) {
            const months = data.momByCategory.months;
            const categories = data.momByCategory.categories;
            const catData = data.momByCategory.data;
            const colors = [
                '#2196F3', '#4CAF50', '#FFC107', '#F44336', '#9C27B0',
                '#00BCD4', '#FF9800', '#795548', '#607D8B', '#E91E63',
                '#BDB76B', '#8A2BE2', '#A52A2A', '#5F9EA0', '#D2691E',
                '#FF7F50', '#6495ED', '#DC143C', '#00FFFF', '#00008B'
            ];
            momCategoryChart.data.labels = months;
            momCategoryChart.data.datasets = categories.map((cat, i) => ({
                label: cat,
                data: catData[cat],
                fill: true,
                backgroundColor: Chart.helpers.color(colors[i % colors.length]).alpha(0.3).rgbString(),
                borderColor: colors[i % colors.length],
                borderWidth: 2,
                pointRadius: 2,
                tension: 0.3,
                stack: 'spending'
            }));
            momCategoryChart.update();
        }

        // Update Category Breakdown Chart
        if (data.categories && data.categories.labels && data.categories.labels.length > 0) {
            // Filter out categories with no transactions
            const validData = data.categories.labels.map((label, index) => ({
                label,
                value: data.categories.values[index],
                recurring: data.categories.recurring[index]
            })).filter(item => item.value !== 0);

            if (validData.length > 0) {
                categoryBreakdownChart.data.labels = validData.map(d => d.label);
                categoryBreakdownChart.data.datasets[0].data = validData.map(d => d.value);
                categoryBreakdownChart.data.datasets[0].backgroundColor = validData.map((_, index) => 
                    `hsl(${(index * 360) / validData.length}, 70%, 60%)`
                );
            } else {
                categoryBreakdownChart.data.labels = ['No Data'];
                categoryBreakdownChart.data.datasets[0].data = [0];
            }
        } else {
            categoryBreakdownChart.data.labels = ['No Data'];
            categoryBreakdownChart.data.datasets[0].data = [0];
        }
        categoryBreakdownChart.update();

        // Update Recent Transactions
        const recentTransactions = document.getElementById('recent-transactions');
        if (data.recentTransactions && data.recentTransactions.length > 0) {
            recentTransactions.innerHTML = data.recentTransactions
                .map(t => `
                    <div class="transaction-item">
                        <div class="transaction-date">${formatDate(t.date)}</div>
                        <div class="transaction-vendor">${t.vendor}</div>
                        <div class="transaction-category">${t.category || 'Uncategorized'}</div>
                        <div class="transaction-amount ${t.amount < 0 ? 'expense' : 'income'}">
                            ${formatAmount(t.amount)}
                            ${t.recurring ? ' 🔄' : ''}
                        </div>
                    </div>
                `)
                .join('');

            // Apply any existing amount filters
            const minAmount = parseFloat(minAmountInput.value) || -Infinity;
            const maxAmount = parseFloat(maxAmountInput.value) || Infinity;
            if (minAmount !== -Infinity || maxAmount !== Infinity) {
                filterRecentTransactions(minAmount, maxAmount);
            }
        } else {
            recentTransactions.innerHTML = '<div class="no-data">No recent transactions</div>';
        }

        // Update chart colors after loading data
        updateChartColors();
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showNotification('Failed to load dashboard data', 'error');
    }
}

// Transactions
async function loadTransactions() {
    try {
        const filters = {
            categoryId: categoryFilter.value || null,
            startDate: dateFilter.value || null,
            search: transactionSearch.value || null
        };

        const transactions = await ipcRenderer.invoke('get-transactions', filters);
        const tbody = document.getElementById('transactions-body');
        
        tbody.innerHTML = transactions.map(t => `
            <tr>
                <td>${formatDate(t.date)}</td>
                <td>${t.vendor_name}</td>
                <td>
                    <span class="category-badge" style="background-color: ${t.category_color || '#e0e0e0'}">
                        ${t.category_name || 'Uncategorized'}
                    </span>
                </td>
                <td class="${t.amount < 0 ? 'expense' : 'income'}">${formatAmount(t.amount)}</td>
                <td>${t.description}</td>
                <td>
                    <button class="delete-btn" data-id="${t.id}" title="Delete transaction">
                        <span class="delete-icon">×</span>
                    </button>
                </td>
            </tr>
        `).join('');

        // Add event listeners to delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm('Are you sure you want to delete this transaction?')) {
                    const transactionId = e.currentTarget.dataset.id;
                    const result = await ipcRenderer.invoke('delete-transaction', transactionId);
                    
                    if (result.success) {
                        showNotification('Transaction deleted successfully');
                        await loadTransactions();
                        // Update dashboard if we're showing it
                        if (!views.transactions.classList.contains('hidden')) {
                            await loadDashboardData();
                        }
                    } else {
                        showNotification('Failed to delete transaction: ' + result.error, 'error');
                    }
                }
            });
        });
    } catch (error) {
        console.error('Error loading transactions:', error);
        showNotification('Failed to load transactions', 'error');
    }
}

// Load categories with colors
async function loadCategories() {
    try {
        const categories = await ipcRenderer.invoke('get-categories');
        console.log('Loaded categories:', categories); // Debug log
        
        // Update category filter and select
        const categoryFilter = document.getElementById('category-filter');
        const categorySelect = document.getElementById('category-select');
        
        // Clear existing options except the first one
        while (categoryFilter.options.length > 1) categoryFilter.remove(1);
        while (categorySelect.options.length > 1) categorySelect.remove(1);
        
        // Add categories with color indicators
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            if (category.color) {
                option.style.backgroundColor = category.color;
                option.style.color = getContrastColor(category.color);
            }
            categoryFilter.appendChild(option.cloneNode(true));
            categorySelect.appendChild(option);
        });

        // Update categories list in settings
        const categoriesList = document.getElementById('categories-list');
        if (categoriesList) {
            categoriesList.innerHTML = categories.map(category => {
                const color = category.color || '#e0e0e0';
                return `
                    <div class="category-item">
                        <div class="category-color" data-category-id="${category.id}" style="background-color: ${color}"></div>
                        <span class="category-name">${category.name}</span>
                        <div class="category-actions">
                            <input type="color" 
                                   class="category-color-picker" 
                                   data-category-id="${category.id}" 
                                   value="${color}"
                                   title="Change category color">
                            <button class="category-btn delete-category-btn" data-category-id="${category.id}">
                                Delete
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
            
            // Set up color pickers after rendering
            setupCategoryColorPickers();
            setupCategoryDeleteButtons();
        }
    } catch (error) {
        console.error('Error loading categories:', error);
        showNotification('Failed to load categories', 'error');
    }
}

// Helper function to determine text color based on background
function getContrastColor(hexColor) {
    // Convert HSL to RGB if needed
    if (hexColor.startsWith('hsl')) {
        const hsl = hexColor.match(/\d+/g);
        const h = parseInt(hsl[0]);
        const s = parseInt(hsl[1]) / 100;
        const l = parseInt(hsl[2]) / 100;
        
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c/2;
        
        let r, g, b;
        if (h < 60) { [r, g, b] = [c, x, 0]; }
        else if (h < 120) { [r, g, b] = [x, c, 0]; }
        else if (h < 180) { [r, g, b] = [0, c, x]; }
        else if (h < 240) { [r, g, b] = [0, x, c]; }
        else if (h < 300) { [r, g, b] = [x, 0, c]; }
        else { [r, g, b] = [c, 0, x]; }
        
        r = Math.round((r + m) * 255);
        g = Math.round((g + m) * 255);
        b = Math.round((b + m) * 255);
        
        hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    // Calculate relative luminance
    const r = parseInt(hexColor.slice(1, 3), 16) / 255;
    const g = parseInt(hexColor.slice(3, 5), 16) / 255;
    const b = parseInt(hexColor.slice(5, 7), 16) / 255;
    
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 0.5 ? '#000000' : '#ffffff';
}

// Import
async function importFiles(filePaths) {
    importProgress.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressText.textContent = 'Processing...';

    try {
        let totalImported = 0;
        let totalDuplicates = 0;
        for (let i = 0; i < filePaths.length; i++) {
            const filePath = filePaths[i];
            const progress = ((i + 1) / filePaths.length) * 100;
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `Processing ${filePath.split(/[\/\\]/).pop()}...`;

            if (!filePath) {
                throw new Error('Invalid file path');
            }

            const result = await ipcRenderer.invoke('import-file', filePath);
            if (!result.success) {
                throw new Error(result.error);
            }

            totalImported += result.count || 0;
            totalDuplicates += result.duplicates || 0;

            // Handle uncategorized transactions
            if (result.uncategorizedTransactions && result.uncategorizedTransactions.length > 0) {
                pendingTransactions = result.uncategorizedTransactions;
                const nextTransaction = pendingTransactions.shift();
                showCategorizationModal(nextTransaction);
                break; // Stop processing more files until current batch is categorized
            }
        }

        if (pendingTransactions.length === 0) {
            let message = `Successfully imported ${totalImported} transactions`;
            if (totalDuplicates > 0) {
                message += ` (${totalDuplicates} duplicates skipped)`;
            }
            progressText.textContent = message;
            showNotification(message);
            
            setTimeout(() => {
                importProgress.classList.add('hidden');
                loadDashboardData();
                loadTransactions();
            }, 1000);
        }
    } catch (error) {
        console.error('Error importing files:', error);
        progressText.textContent = 'Error importing files';
        showNotification('Failed to import files: ' + error.message, 'error');
    }
}

// Show categorization modal
function showCategorizationModal(transaction) {
    currentTransaction = transaction;
    modalDate.textContent = formatDate(transaction.date);
    modalVendor.textContent = transaction.vendor;
    modalAmount.textContent = formatAmount(transaction.amount);
    modalDescription.textContent = transaction.description;
    recurringToggle.checked = false;
    
    // Add color picker if category has a color
    const selectedCategory = categorySelect.options[categorySelect.selectedIndex];
    if (selectedCategory && selectedCategory.style.backgroundColor) {
        const colorPicker = document.getElementById('category-color-picker');
        colorPicker.value = selectedCategory.style.backgroundColor;
        colorPicker.style.display = 'block';
    } else {
        document.getElementById('category-color-picker').style.display = 'none';
    }
    
    modal.classList.remove('hidden');
}

// Hide categorization modal
function hideCategorizationModal() {
    modal.classList.add('hidden');
    currentTransaction = null;
}

// Handle new category creation
async function handleNewCategory() {
    // Create modal container
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.backgroundColor = 'var(--card-background)';
    modal.style.padding = '20px';
    modal.style.borderRadius = '8px';
    modal.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    modal.style.zIndex = '1000';
    modal.style.minWidth = '300px';

    // Create title
    const title = document.createElement('h3');
    title.textContent = 'Add New Category';
    title.style.margin = '0 0 20px 0';
    modal.appendChild(title);

    // Create form container
    const formContainer = document.createElement('div');
    formContainer.style.marginBottom = '20px';

    // Create name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Category Name';
    nameInput.style.width = '100%';
    nameInput.style.padding = '8px';
    nameInput.style.marginBottom = '10px';
    nameInput.style.borderRadius = '4px';
    nameInput.style.border = '1px solid var(--border-color)';
    nameInput.style.backgroundColor = 'var(--background)';
    nameInput.style.color = 'var(--text-primary)';
    formContainer.appendChild(nameInput);

    // Create color picker container
    const colorContainer = document.createElement('div');
    colorContainer.style.display = 'flex';
    colorContainer.style.alignItems = 'center';
    colorContainer.style.marginBottom = '10px';

    // Create color label
    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color:';
    colorLabel.style.marginRight = '10px';
    colorLabel.style.color = 'var(--text-primary)';
    colorContainer.appendChild(colorLabel);

    // Create color picker
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.value = '#e0e0e0'; // Set default color
    colorPicker.style.width = '50px';
    colorPicker.style.height = '30px';
    colorPicker.style.padding = '0';
    colorPicker.style.border = 'none';
    colorPicker.style.borderRadius = '4px';
    colorPicker.style.cursor = 'pointer';
    colorContainer.appendChild(colorPicker);

    formContainer.appendChild(colorContainer);
    modal.appendChild(formContainer);

    // Create buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.justifyContent = 'flex-end';
    buttonsContainer.style.gap = '10px';

    // Create Cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.padding = '8px 16px';
    cancelButton.style.borderRadius = '4px';
    cancelButton.style.border = 'none';
    cancelButton.style.backgroundColor = 'var(--background)';
    cancelButton.style.color = 'var(--text-primary)';
    cancelButton.style.cursor = 'pointer';
    buttonsContainer.appendChild(cancelButton);

    // Create OK button
    const okButton = document.createElement('button');
    okButton.textContent = 'OK';
    okButton.style.padding = '8px 16px';
    okButton.style.borderRadius = '4px';
    okButton.style.border = 'none';
    okButton.style.backgroundColor = 'var(--primary-color)';
    okButton.style.color = 'white';
    okButton.style.cursor = 'pointer';
    buttonsContainer.appendChild(okButton);

    modal.appendChild(buttonsContainer);

    // Create overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '999';

    // Add elements to the page
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
    nameInput.focus();

    // Handle events
    const cleanup = () => {
        document.body.removeChild(overlay);
        document.body.removeChild(modal);
    };

    const handleSubmit = async () => {
        const name = nameInput.value.trim();
        if (name) {
            try {
                console.log('Submitting new category with color:', colorPicker.value); // Debug log
                const result = await ipcRenderer.invoke('add-category', { 
                    name: name,
                    color: colorPicker.value
                });
                
                if (result.success) {
                    showNotification('Category created successfully');
                    cleanup();
                    
                    try {
                        // Always reload categories first since they're used across views
                        await loadCategories();
                        
                        // Then reload data based on current view
                        const currentView = Object.entries(views).find(([_, view]) => !view.classList.contains('hidden'))?.[0];
                        switch (currentView) {
                            case 'dashboard':
                                await loadDashboardData();
                                break;
                            case 'transactions':
                                await loadTransactions();
                                break;
                            case 'settings':
                                // Categories already loaded
                                break;
                        }
                    } catch (reloadError) {
                        console.error('Error reloading data after category creation:', reloadError);
                        // Don't show error to user since category was created successfully
                    }
                } else {
                    showNotification('Failed to create category: ' + result.error, 'error');
                    cleanup();
                }
            } catch (error) {
                console.error('Error creating category:', error);
                showNotification('Failed to create category', 'error');
                cleanup();
            }
        } else {
            cleanup();
        }
    };

    // Add event listeners
    okButton.addEventListener('click', handleSubmit);
    cancelButton.addEventListener('click', cleanup);
    overlay.addEventListener('click', cleanup);
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cleanup();
        }
    });
}

// Handle categorization save
async function handleCategorizationSave() {
    if (!currentTransaction) return;

    try {
        const categoryId = categorySelect.value;
        const isRecurring = recurringToggle.checked;

        // Update vendor category mapping
        await ipcRenderer.invoke('update-vendor-category', {
            vendorId: currentTransaction.vendor_id,
            categoryId: categoryId
        });

        // Update transaction
        await ipcRenderer.invoke('update-transaction', {
            id: currentTransaction.id,
            categoryId: categoryId,
            recurring: isRecurring
        });

        // Process next transaction if any
        hideCategorizationModal();
        if (pendingTransactions.length > 0) {
            const nextTransaction = pendingTransactions.shift();
            showCategorizationModal(nextTransaction);
        } else {
            // Refresh data
            await loadDashboardData();
            await loadTransactions();
        }
    } catch (error) {
        console.error('Error saving categorization:', error);
        showNotification('Failed to save categorization', 'error');
    }
}

// Handle category deletion
async function handleDeleteCategory(categoryId) {
    if (confirm('Are you sure you want to delete this category? This will remove the category from all transactions.')) {
        try {
            const result = await ipcRenderer.invoke('delete-category', categoryId);
            if (result.success) {
                showNotification('Category deleted successfully');
                await loadCategories();
                await loadTransactions();
            } else {
                showNotification('Failed to delete category: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error deleting category:', error);
            showNotification('Failed to delete category', 'error');
        }
    }
}

// Utility Functions
function formatAmount(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function setupCategoryColorPickers() {
    document.querySelectorAll('.category-color-picker').forEach(picker => {
        const categoryId = picker.dataset.categoryId;
        
        picker.addEventListener('change', async function(e) {
            const newColor = e.target.value;
            console.log('Color picker changed:', { categoryId, newColor }); // Debug log
            
            try {
                const result = await ipcRenderer.invoke('update-category-color', {
                    categoryId: parseInt(categoryId), // Ensure categoryId is a number
                    color: newColor
                });
                
                console.log('Update result:', result); // Debug log
                
                if (result.success) {
                    // Update the color swatch
                    const colorSwatch = document.querySelector(`.category-color[data-category-id="${categoryId}"]`);
                    if (colorSwatch) {
                        colorSwatch.style.backgroundColor = newColor;
                    }
                    
                    // Update any category badges in the transactions list
                    document.querySelectorAll(`.category-badge[data-category-id="${categoryId}"]`).forEach(badge => {
                        badge.style.backgroundColor = newColor;
                        badge.style.color = getContrastColor(newColor);
                    });
                    
                    // Update category select options
                    const categorySelects = document.querySelectorAll('select[id$="-category"]');
                    categorySelects.forEach(select => {
                        const option = select.querySelector(`option[value="${categoryId}"]`);
                        if (option) {
                            option.style.backgroundColor = newColor;
                            option.style.color = getContrastColor(newColor);
                        }
                    });
                    
                    showNotification('Category color updated successfully');
                } else {
                    showNotification('Failed to update category color', 'error');
                    // Revert the color picker to the previous value
                    const colorSwatch = document.querySelector(`.category-color[data-category-id="${categoryId}"]`);
                    e.target.value = colorSwatch ? colorSwatch.style.backgroundColor : '#e0e0e0';
                }
            } catch (error) {
                console.error('Error updating category color:', error);
                showNotification('Failed to update category color', 'error');
                // Revert the color picker to the previous value
                const colorSwatch = document.querySelector(`.category-color[data-category-id="${categoryId}"]`);
                e.target.value = colorSwatch ? colorSwatch.style.backgroundColor : '#e0e0e0';
            }
        });
    });
}

function renderCategories(categories) {
    const categoriesList = document.getElementById('categories-list');
    if (!categoriesList) return;
    
    categoriesList.innerHTML = categories.map(category => `
        <div class="category-item">
            <div class="category-color" data-category-id="${category.id}" style="background-color: ${category.color || '#e0e0e0'}"></div>
            <span class="category-name">${category.name}</span>
            <div class="category-actions">
                <input type="color" 
                       class="category-color-picker" 
                       data-category-id="${category.id}" 
                       value="${category.color || '#e0e0e0'}"
                       title="Change category color">
                <button class="category-btn delete-category-btn" data-category-id="${category.id}">
                    Delete
                </button>
            </div>
        </div>
    `).join('');
    
    setupCategoryColorPickers();
    setupCategoryDeleteButtons();
}

function initCategoryBreakdownChart(data) {
    const canvas = document.getElementById('category-breakdown-chart');
    if (!canvas) {
        console.error('Canvas element for category breakdown chart not found.');
        return;
    }
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.categoryBreakdownChart) {
        window.categoryBreakdownChart.destroy();
    }
    
    // Filter out categories with no transactions
    const validData = data.categories.labels.map((label, index) => ({
        label,
        value: data.categories.values[index],
        recurring: data.categories.recurring[index]
    })).filter(item => item.value !== 0);
    
    if (validData.length === 0) {
        canvas.parentElement.innerHTML = `
            <div class="no-data">No categorized transactions in the last 30 days</div>
        `;
        return;
    }
    
    window.categoryBreakdownChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: validData.map(d => d.label),
            datasets: [{
                data: validData.map(d => d.value),
                backgroundColor: validData.map(d => d.color || generatePastelColor()),
                borderColor: 'var(--card-background)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: 'var(--text-primary)',
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const recurring = validData[context.dataIndex].recurring;
                            return [
                                `${context.label}: $${Math.abs(value).toFixed(2)}`,
                                `Recurring transactions: ${recurring}`
                            ];
                        }
                    }
                }
            }
        }
    });
}

// Add new function for filtering transactions
function filterRecentTransactions(minAmount, maxAmount) {
    const recentTransactions = document.getElementById('recent-transactions');
    const transactions = Array.from(recentTransactions.children);
    
    transactions.forEach(transaction => {
        const amountElement = transaction.querySelector('.transaction-amount');
        if (amountElement) {
            const amount = parseFloat(amountElement.textContent.replace(/[^0-9.-]+/g, ''));
            if (amount >= minAmount && amount <= maxAmount) {
                transaction.style.display = '';
            } else {
                transaction.style.display = 'none';
            }
        }
    });
}

function setupCategoryDeleteButtons() {
    const deleteButtons = document.querySelectorAll('.delete-category-btn');
    deleteButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            const categoryId = e.currentTarget.dataset.categoryId;
            if (confirm('Are you sure you want to delete this category? This will remove the category from all transactions.')) {
                try {
                    const result = await ipcRenderer.invoke('delete-category', parseInt(categoryId));
                    if (result.success) {
                        showNotification('Category deleted successfully');
                        
                        // Reload data based on current view
                        const currentView = Object.entries(views).find(([_, view]) => !view.classList.contains('hidden'))?.[0];
                        
                        switch (currentView) {
                            case 'dashboard':
                                await loadDashboardData();
                                break;
                            case 'transactions':
                                await loadTransactions();
                                break;
                            case 'settings':
                                await loadCategories();
                                break;
                        }
                        
                        // Always reload categories since they're used across views
                        await loadCategories();
                    } else {
                        showNotification('Failed to delete category: ' + result.error, 'error');
                    }
                } catch (error) {
                    console.error('Error deleting category:', error);
                    showNotification('Failed to delete category', 'error');
                }
            }
        });
    });
}

// Add this near other initialization code
document.getElementById('clear-all-data-btn').addEventListener('click', async () => {
    const confirmed = confirm('Are you sure you want to clear all data? This action cannot be undone.');
    if (confirmed) {
        try {
            const result = await window.electron.ipcRenderer.invoke('clear-all-data');
            if (result.success) {
                showNotification('All data has been cleared successfully', 'success');
                // Reload the dashboard to reflect changes
                loadDashboardData();
                // Reload categories if in settings view
                if (currentView === 'settings') {
                    loadCategories();
                }
            } else {
                showNotification('Failed to clear data: ' + result.error, 'error');
            }
        } catch (error) {
            showNotification('Error clearing data: ' + error.message, 'error');
        }
    }
});

// Add this function to update chart colors based on theme
function updateChartColors() {
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDarkMode ? '#FFFFFF' : '#212121';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    // Update MoM Category Chart
    if (momCategoryChart) {
        momCategoryChart.options.scales.x.ticks.color = textColor;
        momCategoryChart.options.scales.y.ticks.color = textColor;
        momCategoryChart.options.scales.x.grid.color = gridColor;
        momCategoryChart.options.scales.y.grid.color = gridColor;
        momCategoryChart.options.plugins.legend.labels.color = textColor;
        momCategoryChart.update();
    }

    // Update Category Breakdown Chart
    if (categoryBreakdownChart) {
        categoryBreakdownChart.options.plugins.legend.labels.color = textColor;
        categoryBreakdownChart.update();
    }
}

// Add error handling
window.addEventListener('error', (event) => {
    console.error('Renderer error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});

// Initialize the application
init(); 