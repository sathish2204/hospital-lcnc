/**
 * HOSPITAL MANAGEMENT LCNC FRAMEWORK - SHARED UTILITIES
 * ======================================================
 * This JavaScript file contains shared utility functions used across
 * all pages of the LCNC Hospital Management demo.
 * 
 * LCNC CONCEPT: These utilities abstract away the "database" (localStorage)
 * and provide common functionality, demonstrating how a real LCNC platform
 * would provide APIs that non-technical users don't need to understand.
 */

// ============================================
// LOCAL STORAGE UTILITIES (Simulated Database)
// ============================================
/**
 * LCNC CONCEPT: In a real low-code platform, data would be stored in a
 * database. Here we use localStorage to simulate persistent storage.
 * Users configure the system through UI, not by writing database queries.
 */

// detect if we are running locally as a file or on a server
const isLocalFile = window.location.protocol === 'file:';
const API_BASE_URL = isLocalFile ? 'http://localhost:3000' : window.location.origin;

let DB_CACHE = {};
let DB_INITIALIZED = false;

/**
 * Initialize the database cache from Neon
 */
async function initRemoteStorage() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/store`);
        DB_CACHE = await response.json();
        DB_INITIALIZED = true;
        console.log('Remote storage initialized');
        return true;
    } catch (error) {
        console.error('Error initializing remote storage:', error);
        // Fallback to localStorage if API fails
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                DB_CACHE[key] = JSON.parse(localStorage.getItem(key));
            }
        } catch (e) { }
        DB_INITIALIZED = true;
        return false;
    }
}

/**
 * Save data to cache and sync to Neon Database
 * @param {string} key - Storage key
 * @param {any} data - Data to store
 */
function saveToStorage(key, data) {
    // Update local cache immediately (synchronous)
    DB_CACHE[key] = data;

    // Sync to database in background
    fetch(`${API_BASE_URL}/api/store/${key}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: data }),
    }).catch(error => console.error('Background sync failed:', error));

    return true;
}

/**
 * Load data from cache
 * @param {string} key - Storage key
 * @param {any} defaultValue - Default value if key doesn't exist
 * @returns {any} Data or default value
 */
function loadFromStorage(key, defaultValue = null) {
    if (DB_CACHE[key] !== undefined && DB_CACHE[key] !== null) {
        return DB_CACHE[key];
    }
    return defaultValue;
}

/**
 * Remove data from cache and Neon Database
 * @param {string} key - Storage key to remove
 */
function removeFromStorage(key) {
    delete DB_CACHE[key];
    fetch(`${API_BASE_URL}/api/store/${key}`, {
        method: 'DELETE',
    }).catch(error => console.error('Background delete failed:', error));
}

// ============================================
// NOTIFICATION SYSTEM
// ============================================
/**
 * LCNC CONCEPT: Visual feedback is important in low-code platforms.
 * Users need to know when their configurations are saved successfully.
 */

/**
 * Show a notification toast message
 * @param {string} message - Message to display
 * @param {string} type - Notification type: 'success', 'error', 'info'
 * @param {number} duration - How long to show the notification (ms)
 */
function showNotification(message, type = 'success', duration = 3000) {
    // Create container if it doesn't exist
    let container = document.querySelector('.notification-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        document.body.appendChild(container);
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    // Add icon based on type
    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
    };

    notification.innerHTML = `
        <span style="font-size: 1.2rem;">${icons[type] || icons.info}</span>
        <span>${message}</span>
    `;

    container.appendChild(notification);

    // Remove after duration
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, duration);
}

// ============================================
// LCNC ENGINE - SHARED DATA & FUNCTIONS
// ============================================
/**
 * This section contains all shared LCNC data structures and helper functions
 * that are needed across multiple pages (templates.js, activity.js, etc.)
 */

// Pre-built workflow templates
const WORKFLOW_TEMPLATES = {
    receptionist: {
        id: 'receptionist',
        name: 'Front Desk',
        icon: '👩‍💼',
        color: '#48bb78',
        description: 'Patient registration and queue management',
        enabled: true,
        features: [
            'Register new patients',
            'Generate tokens',
            'Collect basic info',
            'Send patients to Doctor queue'
        ],
        workflow: 'Patient arrives → Register → Generate Token → Send to Doctor'
    },
    doctor: {
        id: 'doctor',
        name: 'Doctor',
        icon: '👨‍⚕️',
        color: '#667eea',
        description: 'Patient consultation, diagnosis, and treatment',
        enabled: true,
        features: [
            'View OPD patients queue',
            'Diagnose and prescribe',
            'Send to Lab for tests',
            'Admit to IPD'
        ],
        workflow: 'Consult → Diagnose → Prescribe → [Lab/Admit/Discharge]'
    },
    lab_technician: {
        id: 'lab_technician',
        name: 'Lab Technician',
        icon: '🔬',
        color: '#ed8936',
        description: 'Process lab tests and enter results',
        enabled: true,
        features: [
            'View pending lab tests',
            'Enter test results',
            'Mark as Normal/Abnormal',
            'Send results back to Doctor'
        ],
        workflow: 'Receive patient → Run tests → Enter results → Send to Doctor'
    },
    billing: {
        id: 'billing',
        name: 'Billing',
        icon: '💰',
        color: '#e53e3e',
        description: 'Handle admissions and discharge billing',
        enabled: true,
        features: [
            'Approve admission requests',
            'Set deposit amounts',
            'Process discharge bills'
        ],
        workflow: 'Receive request → Process bill → Approve/Complete'
    },
    admin: {
        id: 'admin',
        name: 'Admin',
        icon: '👑',
        color: '#9f7aea',
        description: 'System administration and overview',
        enabled: true,
        isSystem: true,
        features: [
            'View all queues overview',
            'Manage workflow templates',
            'View reports'
        ],
        workflow: 'Monitor → Configure → Manage'
    }
};

// Default form fields for each role
const DEFAULT_FORM_FIELDS = {
    receptionist: [
        { id: 'name', label: 'Patient Name', type: 'text', required: true, placeholder: 'Enter full name' },
        { id: 'age', label: 'Age', type: 'number', required: true, placeholder: 'Years' },
        { id: 'gender', label: 'Gender', type: 'select', required: true, options: ['Male', 'Female', 'Other'] },
        { id: 'phone', label: 'Phone Number', type: 'tel', required: true, placeholder: '10-digit number' },
        { id: 'address', label: 'Address', type: 'textarea', required: false, placeholder: 'Full address' },
        { id: 'complaint', label: 'Chief Complaint', type: 'textarea', required: true, placeholder: 'Reason for visit' }
    ],
    doctor: [
        { id: 'diagnosis', label: 'Diagnosis', type: 'textarea', required: true, placeholder: 'Enter diagnosis' },
        { id: 'prescription', label: 'Prescription', type: 'textarea', required: false, placeholder: 'Medicines and instructions' },
        { id: 'notes', label: 'Doctor Notes', type: 'textarea', required: false, placeholder: 'Additional notes' }
    ],
    lab: [
        { id: 'testType', label: 'Test Type', type: 'select', required: true, options: ['Blood Test (CBC)', 'Urine Test', 'X-Ray', 'MRI', 'CT Scan', 'Liver Function', 'Kidney Function', 'Thyroid Panel', 'Lipid Profile', 'Blood Sugar'] },
        { id: 'testResult', label: 'Test Result', type: 'textarea', required: true, placeholder: 'Enter detailed results' },
        { id: 'status', label: 'Status', type: 'select', required: true, options: ['Normal', 'Abnormal', 'Critical', 'Pending Review'] },
        { id: 'remarks', label: 'Remarks', type: 'textarea', required: false, placeholder: 'Additional remarks' }
    ]
};

// Available field types for adding new fields
const FIELD_TYPES = [
    { type: 'text', label: 'Text Input', icon: '📝' },
    { type: 'number', label: 'Number', icon: '🔢' },
    { type: 'tel', label: 'Phone', icon: '📞' },
    { type: 'email', label: 'Email', icon: '📧' },
    { type: 'date', label: 'Date', icon: '📅' },
    { type: 'textarea', label: 'Text Area', icon: '📄' },
    { type: 'select', label: 'Dropdown', icon: '📋' },
    { type: 'checkbox', label: 'Checkbox', icon: '☑️' }
];

// Hospital settings defaults
const DEFAULT_HOSPITAL_CONFIG = {
    name: 'My Hospital',
    enabledWorkflows: ['receptionist', 'doctor', 'lab_technician', 'billing', 'admin'],
    workflowOrder: ['receptionist', 'doctor', 'lab_technician', 'billing'],
    // Roles that can access patient search functionality
    searchAccess: ['receptionist', 'doctor', 'admin'],
    // Deleted default workflows (can be restored)
    deletedWorkflows: []
};

// Default workflow connections (who can send to whom)
const DEFAULT_WORKFLOW_CONNECTIONS = {
    'receptionist': ['doctor'],
    'doctor': ['lab_technician', 'billing', 'completed'],
    'lab_technician': ['doctor'],
    'billing': ['completed'],
    'admin': []
};

// --- LCNC Helper Functions ---

function getHospitalConfig() {
    return loadFromStorage('hospitalConfig', DEFAULT_HOSPITAL_CONFIG);
}

function saveHospitalConfig(config) {
    saveToStorage('hospitalConfig', config);
}

function getWorkflowConnections() {
    return loadFromStorage('workflowConnections', DEFAULT_WORKFLOW_CONNECTIONS);
}

function saveWorkflowConnections(connections) {
    saveToStorage('workflowConnections', connections);
}

// Get all workflows (default + custom, excluding deleted ones)
function getCustomWorkflows() {
    const customTemplates = loadFromStorage('customTemplates', {});
    const customWorkflows = loadFromStorage('customWorkflows', {});
    const config = getHospitalConfig();
    const deletedWorkflows = config.deletedWorkflows || [];

    // Start with all base templates (excluding deleted ones) + custom workflows
    const activeTemplates = {};
    Object.keys(WORKFLOW_TEMPLATES).forEach(key => {
        if (!deletedWorkflows.includes(key)) {
            activeTemplates[key] = WORKFLOW_TEMPLATES[key];
        }
    });

    const merged = { ...activeTemplates, ...customWorkflows };

    // Apply template overrides (name, icon, color customizations)
    Object.keys(customTemplates).forEach(key => {
        if (merged[key]) {
            merged[key] = { ...merged[key], ...customTemplates[key] };
        } else {
            merged[key] = customTemplates[key];
        }
    });

    return merged;
}

// Get deleted default workflows (for restore functionality)
function getDeletedWorkflows() {
    const config = getHospitalConfig();
    const deletedIds = config.deletedWorkflows || [];
    return deletedIds.map(id => WORKFLOW_TEMPLATES[id]).filter(w => w !== undefined);
}

// Get form fields for a specific role/form type
function getFormFields(formType) {
    // Check new format: customFormFields_${formType} (separate keys)
    const customFieldsNew = loadFromStorage(`customFormFields_${formType}`, null);
    if (customFieldsNew) return customFieldsNew;

    // Check old format: customFormFields object with formType as key (used by Form Builder)
    const customFieldsObj = loadFromStorage('customFormFields', null);
    if (customFieldsObj && customFieldsObj[formType]) {
        return customFieldsObj[formType];
    }

    // Fallback to defaults
    return DEFAULT_FORM_FIELDS[formType] || [];
}

// Save form fields for a specific role
function saveFormFields(formType, fields) {
    saveToStorage(`customFormFields_${formType}`, fields);
}

// Render a form field input (shared between templates preview and activity forms)
function renderFieldInput(field, valuePrefix = 'field_') {
    const id = `${valuePrefix}${field.id}`;
    const req = field.required ? 'required' : '';

    switch (field.type) {
        case 'textarea':
            return `<textarea class="form-textarea" id="${id}" name="${field.id}" ${req} rows="3" placeholder="${field.placeholder || ''}"></textarea>`;
        case 'select':
        case 'dropdown':
            return `
                <select class="form-select" id="${id}" name="${field.id}" ${req}>
                    <option value="">Select option</option>
                    ${(field.options || []).map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                </select>
            `;
        case 'checkbox':
            return `<input type="checkbox" id="${id}" name="${field.id}" style="width: 20px; height: 20px;">`;
        default:
            return `<input type="${field.type === 'number' ? 'number' : field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : 'text'}" class="form-input" id="${id}" name="${field.id}" ${req} placeholder="${field.placeholder || ''}">`;
    }
}

// ============================================
// ROLE-BASED ACCESS CONTROL
// ============================================
/**
 * LCNC CONCEPT: Role-based access is configured through UI, not code.
 * The system reads role permissions from configuration and applies them
 * automatically to show/hide features.
 */

// Default role permissions configuration
// Activity page is the main work area for each role
const DEFAULT_ROLE_PERMISSIONS = {
    admin: {
        name: 'Admin',
        icon: '👑',
        modules: ['activity', 'templates', 'reports']  // Simplified for LCNC
    },
    doctor: {
        name: 'Doctor',
        icon: '👨‍⚕️',
        modules: ['activity', 'reports']
    },
    receptionist: {
        name: 'Receptionist',
        icon: '👩‍💼',
        modules: ['activity', 'reports']
    },
    lab_technician: {
        name: 'Lab Technician',
        icon: '🔬',
        modules: ['activity', 'reports']
    },
    billing: {
        name: 'Billing',
        icon: '💰',
        modules: ['activity', 'reports']
    }
};

/**
 * Get the currently logged-in user's role
 * @returns {string} Current role ID
 */
function getCurrentRole() {
    return loadFromStorage('currentRole', 'admin');
}

/**
 * Set the current user role (simulates login)
 * @param {string} roleId - Role to set
 */
function setCurrentRole(roleId) {
    saveToStorage('currentRole', roleId);
}

/**
 * Get role permissions (either saved or default, including custom roles)
 * @returns {object} Role permissions configuration
 */
function getRolePermissions() {
    const basePermissions = loadFromStorage('rolePermissions', DEFAULT_ROLE_PERMISSIONS);
    const customWorkflows = loadFromStorage('customWorkflows', {});

    // Merge custom workflows into permissions
    const merged = { ...basePermissions };
    Object.keys(customWorkflows).forEach(id => {
        if (!merged[id]) {
            merged[id] = {
                name: customWorkflows[id].name,
                icon: customWorkflows[id].icon,
                modules: ['activity'] // Custom roles get activity access by default
            };
        }
    });

    return merged;
}

/**
 * Check if current role has access to a module
 * @param {string} moduleId - Module to check access for
 * @returns {boolean} Whether access is allowed
 */
function checkAccess(moduleId) {
    const currentRole = getCurrentRole();
    const permissions = getRolePermissions();
    const roleConfig = permissions[currentRole];

    // Custom roles always have activity access
    if (!roleConfig) {
        const customWorkflows = loadFromStorage('customWorkflows', {});
        if (customWorkflows[currentRole] && moduleId === 'activity') {
            return true;
        }
        return false;
    }
    return roleConfig.modules.includes(moduleId);
}

/**
 * Get display info for current role
 * @returns {object} Role name and icon
 */
function getCurrentRoleInfo() {
    const currentRole = getCurrentRole();
    const permissions = getRolePermissions();

    if (permissions[currentRole]) {
        return permissions[currentRole];
    }

    // Check custom workflows
    const customWorkflows = loadFromStorage('customWorkflows', {});
    if (customWorkflows[currentRole]) {
        return {
            name: customWorkflows[currentRole].name,
            icon: customWorkflows[currentRole].icon
        };
    }

    return { name: 'Unknown', icon: '👤' };
}

// ============================================
// NAVIGATION BUILDER
// ============================================
/**
 * LCNC CONCEPT: Navigation is dynamically built based on role permissions.
 * This demonstrates how UI components adapt to configuration without code changes.
 */

// Navigation items configuration
// Activity is the primary work page for most roles
const NAV_ITEMS = [
    { id: 'activity', label: '📋 Activity', href: 'activity.html' },
    { id: 'templates', label: '🧩 Templates', href: 'templates.html' },
    { id: 'reports', label: '📊 Reports', href: 'reports.html' }
];

/**
 * Get the correct path prefix based on current page location
 * Returns 'html/' if on root (index.html), empty string if in html/ folder
 */
function getHtmlPathPrefix() {
    const pathname = window.location.pathname;
    // Check if we're on index.html at root or just at root
    const isRootPage = pathname === '/' || pathname.endsWith('/index.html') || pathname.endsWith('index.html');
    return isRootPage ? 'html/' : '';
}

/**
 * Render navigation based on current role permissions
 * @param {string} currentPageId - ID of the current page (for active state)
 */
function renderNavigation(currentPageId) {
    const navContainer = document.querySelector('.nav');
    if (!navContainer) return;

    const currentRole = getCurrentRole();
    const permissions = getRolePermissions();
    const roleConfig = permissions[currentRole];

    if (!roleConfig) return;

    // Clear existing nav items
    navContainer.innerHTML = '';

    // Get path prefix for navigation links
    const pathPrefix = getHtmlPathPrefix();

    // Build navigation based on permissions
    NAV_ITEMS.forEach(item => {
        if (roleConfig.modules.includes(item.id)) {
            const link = document.createElement('a');
            link.href = pathPrefix + item.href;
            link.className = `nav-link${item.id === currentPageId ? ' active' : ''}`;
            link.textContent = item.label;
            navContainer.appendChild(link);
        }
    });
}

function renderRoleIndicator() {
    const container = document.querySelector('.role-indicator');
    if (!container) return;

    const currentRole = getCurrentRole();
    const customWorkflows = loadFromStorage('customWorkflows', {});

    // Combine built-in permissions with custom ones
    const permissions = { ...DEFAULT_ROLE_PERMISSIONS };
    Object.keys(customWorkflows).forEach(id => {
        permissions[id] = {
            name: customWorkflows[id].name,
            icon: customWorkflows[id].icon,
            modules: ['activity']
        };
    });

    const roleInfo = permissions[currentRole] || DEFAULT_ROLE_PERMISSIONS.admin;

    // Role descriptions for the dropdown
    const roleDescriptions = {
        admin: 'Full system access',
        doctor: 'Clinical features',
        receptionist: 'Front desk access',
        lab_technician: 'Lab module access',
        billing: 'Payments and invoices'
    };

    // Build role options HTML
    let roleOptionsHTML = '';
    for (const [roleId, roleConfig] of Object.entries(permissions)) {
        const isActive = roleId === currentRole;
        // Use custom workflow description if available, otherwise use default description
        const description = customWorkflows[roleId]?.description || roleDescriptions[roleId] || 'Custom LCNC Role';
        roleOptionsHTML += `
            <div class="role-option ${isActive ? 'active' : ''}" data-role="${roleId}">
                <div class="role-option-icon">${roleConfig.icon}</div>
                <div class="role-option-info">
                    <div class="role-option-name">${roleConfig.name}</div>
                    <div class="role-option-desc">${description}</div>
                </div>
                ${isActive ? '<span class="role-option-check">✓</span>' : ''}
            </div>
        `;
    }

    // Build the switcher UI
    container.className = 'role-switcher';
    container.innerHTML = `
        <div class="role-switcher-btn" id="roleSwitcherBtn">
            <span>${roleInfo.icon}</span>
            <span class="role-badge">${roleInfo.name}</span>
            <span class="role-switcher-arrow">▼</span>
        </div>
        <div class="role-dropdown" id="roleDropdown">
            <div class="role-dropdown-header">Switch Role</div>
            ${roleOptionsHTML}
        </div>
    `;

    // Dropdown toggle logic
    const switcherBtn = container.querySelector('#roleSwitcherBtn');
    switcherBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        container.classList.toggle('open');
    });

    // Handle role selection
    const roleOptions = container.querySelectorAll('.role-option');
    roleOptions.forEach(option => {
        option.addEventListener('click', () => {
            const newRole = option.getAttribute('data-role');
            if (newRole !== currentRole) {
                setCurrentRole(newRole);
                showNotification(`Logging in as ${permissions[newRole].name}`, 'success');
                setTimeout(() => {
                    // Redirect to activity page or index depending on role
                    const pathPrefix = getHtmlPathPrefix();
                    if (newRole === 'admin') {
                        window.location.href = pathPrefix + 'templates.html';
                    } else {
                        window.location.href = pathPrefix + 'activity.html';
                    }
                }, 800);
            }
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            container.classList.remove('open');
        }
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') container.classList.remove('open');
    });
}
// ============================================
// MODULE CONFIGURATION
// ============================================
/**
 * LCNC CONCEPT: Modules are configuration-driven. Hospitals can enable/disable
 * features without code changes. The system adapts based on saved configuration.
 */

// Default modules configuration
const DEFAULT_MODULES = [
    {
        id: 'registration', name: 'Registration', icon: '📋', enabled: true,
        description: 'Patient registration and demographics'
    },
    {
        id: 'opd', name: 'OPD', icon: '🏥', enabled: true,
        description: 'Outpatient department management'
    },
    {
        id: 'ipd', name: 'IPD', icon: '🛏️', enabled: false,
        description: 'Inpatient department and admissions'
    },
    {
        id: 'lab', name: 'Lab', icon: '🔬', enabled: true,
        description: 'Laboratory tests and results'
    },
    {
        id: 'billing', name: 'Billing', icon: '💰', enabled: true,
        description: 'Bills, payments, and invoices'
    },
    {
        id: 'pharmacy', name: 'Pharmacy', icon: '💊', enabled: false,
        description: 'Medicine inventory and dispensing'
    }
];

/**
 * Get enabled modules configuration
 * @returns {array} Array of module configurations
 */
function getModulesConfig() {
    return loadFromStorage('modulesConfig', DEFAULT_MODULES);
}

/**
 * Save modules configuration
 * @param {array} modules - Array of module configurations
 */
function saveModulesConfig(modules) {
    saveToStorage('modulesConfig', modules);
}

// ============================================
// FORM SCHEMA UTILITIES
// ============================================
/**
 * LCNC CONCEPT: Forms are defined as JSON schemas, not hardcoded HTML.
 * Users build forms through a visual interface, and the schema is rendered at runtime.
 */

/**
 * Get saved form schema
 * @param {string} formId - Form identifier
 * @returns {array} Array of field definitions
 */
function getFormSchema(formId = 'patientRegistration') {
    const schemas = loadFromStorage('formSchemas', {});
    return schemas[formId] || [];
}

/**
 * Save form schema
 * @param {string} formId - Form identifier
 * @param {array} fields - Array of field definitions
 */
function saveFormSchema(formId, fields) {
    const schemas = loadFromStorage('formSchemas', {});
    schemas[formId] = fields;
    saveToStorage('formSchemas', schemas);
}

/**
 * Generate unique ID for form fields
 * @returns {string} Unique identifier
 */
function generateFieldId() {
    return 'field_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ============================================
// WORKFLOW UTILITIES
// ============================================
/**
 * LCNC CONCEPT: Workflows are defined as ordered arrays of steps.
 * Hospitals can customize patient journey without programming.
 */

// Default patient workflow
const DEFAULT_WORKFLOW = [
    { id: 'registration', name: 'Registration', icon: '📋' },
    { id: 'consultation', name: 'Consultation', icon: '👨‍⚕️' },
    { id: 'lab', name: 'Lab Tests', icon: '🔬' },
    { id: 'billing', name: 'Billing', icon: '💰' },
    { id: 'followup', name: 'Follow-up', icon: '📅' }
];

/**
 * Get workflow configuration
 * @returns {array} Ordered array of workflow steps
 */
function getWorkflow() {
    return loadFromStorage('patientWorkflow', DEFAULT_WORKFLOW);
}

/**
 * Save workflow configuration
 * @param {array} steps - Ordered array of workflow steps
 */
function saveWorkflow(steps) {
    saveToStorage('patientWorkflow', steps);
}

// ============================================
// RULES ENGINE UTILITIES
// ============================================
/**
 * LCNC CONCEPT: Business rules are defined through UI, not code.
 * IF-THEN rules are stored as JSON and executed by the rules engine.
 */

/**
 * Get saved rules
 * @returns {array} Array of rule definitions
 */
function getRules() {
    return loadFromStorage('businessRules', []);
}

/**
 * Save rules
 * @param {array} rules - Array of rule definitions
 */
function saveRules(rules) {
    saveToStorage('businessRules', rules);
}

/**
 * Execute a rule (demo simulation)
 * @param {object} rule - Rule to execute
 * @param {object} data - Context data for rule evaluation
 * @returns {boolean} Whether rule condition was met
 */
function executeRule(rule, data) {
    // This is a simplified demo. Real rules engine would be more sophisticated.
    const { field, condition, value, action } = rule;
    let conditionMet = false;

    // Evaluate condition based on field and condition type
    switch (condition) {
        case '>':
            conditionMet = Number(data[field]) > Number(value);
            break;
        case '<':
            conditionMet = Number(data[field]) < Number(value);
            break;
        case '=':
        case 'equals':
            conditionMet = String(data[field]).toLowerCase() === String(value).toLowerCase();
            break;
        case 'unpaid':
            conditionMet = data[field] === 'unpaid';
            break;
        case 'positive':
            conditionMet = data[field] === 'positive';
            break;
        case 'negative':
            conditionMet = data[field] === 'negative';
            break;
        default:
            conditionMet = false;
    }

    return conditionMet;
}

// ============================================
// DEMO DATA UTILITIES
// ============================================
/**
 * LCNC CONCEPT: Reports are generated from data, not hardcoded.
 * This demo uses fake data, but in production it would come from the database.
 */

/**
 * Get demo statistics for reports
 * @returns {object} Demo statistics data
 */
function getDemoStats() {
    return {
        dailyPatients: 47,
        monthlyRevenue: 125000,
        pendingBills: 12,
        totalStaff: 35,
        departmentVisits: [
            { department: 'General Medicine', visits: 156, revenue: 45000 },
            { department: 'Pediatrics', visits: 89, revenue: 28000 },
            { department: 'Orthopedics', visits: 67, revenue: 52000 },
            { department: 'Cardiology', visits: 45, revenue: 38000 },
            { department: 'Dermatology', visits: 78, revenue: 22000 }
        ],
        monthlyData: [
            { month: 'Jul', patients: 320, revenue: 95000 },
            { month: 'Aug', patients: 380, revenue: 110000 },
            { month: 'Sep', patients: 420, revenue: 125000 },
            { month: 'Oct', patients: 390, revenue: 115000 },
            { month: 'Nov', patients: 450, revenue: 135000 },
            { month: 'Dec', patients: 410, revenue: 125000 }
        ]
    };
}

// ============================================
// PAGE INITIALIZATION
// ============================================
/**
 * Common initialization function for all pages
 * @param {string} pageId - Current page identifier
 */
function initPage(pageId) {
    // Render navigation based on role
    renderNavigation(pageId);

    // Render role indicator
    renderRoleIndicator();

    // Update hospital name in header
    const config = getHospitalConfig();
    if (config && config.name) {
        const logoText = document.querySelector('.logo-text');
        if (logoText) {
            logoText.textContent = config.name;
        }
    }

    console.log(`LCNC Demo: ${pageId} page initialized with role: ${getCurrentRole()}`);
}

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        saveToStorage,
        loadFromStorage,
        showNotification,
        getCurrentRole,
        setCurrentRole,
        checkAccess,
        getRolePermissions,
        getModulesConfig,
        saveModulesConfig,
        getFormSchema,
        saveFormSchema,
        getWorkflow,
        saveWorkflow,
        getRules,
        saveRules,
        getDemoStats,
        initPage
    };
}
