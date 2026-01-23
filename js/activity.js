/**
 * ACTIVITY PAGE - Role-Based Patient Workflow
 * ============================================
 * Each role has specific activities:
 * - Receptionist: Register new patients
 * - Doctor: Diagnose and prescribe
 * - Lab Technician: Enter test results
 * - Admin: View overview
 */

// Patient queues for each department
const QUEUE_KEYS = {
    reception: 'queue_reception',
    doctor: 'queue_doctor',
    lab: 'queue_lab',
    billing: 'queue_billing',           // Pending billing approval
    ipd: 'queue_ipd',                   // Admitted patients (In-Patient)
    discharge_billing: 'queue_discharge_billing',  // Discharge pending billing
    completed: 'queue_completed'        // Discharged/Completed
};

// Generate unique patient ID (more unique format)
function generatePatientId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return 'P' + timestamp.slice(-8) + random;
}

// Generate token number for the day
function generateToken() {
    const today = new Date().toDateString();
    let tokenData = loadFromStorage('tokenData', { date: today, count: 0 });

    if (tokenData.date !== today) {
        tokenData = { date: today, count: 0 };
    }

    tokenData.count++;
    saveToStorage('tokenData', tokenData);

    return tokenData.count.toString().padStart(3, '0');
}

// Get patients in a specific queue
function getQueue(queueKey) {
    return loadFromStorage(queueKey, []);
}

// Add patient to queue
function addToQueue(queueKey, patient) {
    const queue = getQueue(queueKey);
    queue.push(patient);
    saveToStorage(queueKey, queue);
}

// Remove patient from queue
function removeFromQueue(queueKey, patientId) {
    let queue = getQueue(queueKey);
    const initialLength = queue.length;
    // Use strict comparison and ensure both are strings for consistency
    queue = queue.filter(p => String(p.id) !== String(patientId));
    const finalLength = queue.length;

    if (initialLength === finalLength) {
        console.warn(`Patient ${patientId} not found in queue ${queueKey}. Queue length: ${initialLength}`);
        // Log queue contents for debugging
        console.log('Queue contents:', queue.map(p => ({ id: p.id, name: p.name })));
    } else {
        console.log(`Removed patient ${patientId} from ${queueKey}. Queue: ${initialLength} → ${finalLength}`);
    }

    saveToStorage(queueKey, queue);
    return initialLength !== finalLength; // Return true if patient was removed
}

// Move patient between queues
function movePatient(fromQueue, toQueue, patientId, updates = {}) {
    const fromQueueData = getQueue(fromQueue);
    // Use string comparison for patient ID matching to handle type mismatches
    const patient = fromQueueData.find(p => String(p.id) === String(patientId));

    if (patient) {
        // Add history entry
        if (!patient.history) patient.history = [];
        patient.history.push({
            action: updates.action || `Moved to ${toQueue}`,
            by: getCurrentRoleInfo().name,
            time: new Date().toISOString(),
            notes: updates.notes || ''
        });

        // Apply updates
        Object.assign(patient, updates);
        patient.currentQueue = toQueue;
        patient.updatedAt = new Date().toISOString();

        // Remove from source queue FIRST
        const removed = removeFromQueue(fromQueue, patientId);
        if (!removed) {
            console.error('Failed to remove patient from source queue:', fromQueue, patientId);
            // Try alternative removal method
            let queue = getQueue(fromQueue);
            const index = queue.findIndex(p => String(p.id) === String(patientId));
            if (index !== -1) {
                queue.splice(index, 1);
                saveToStorage(fromQueue, queue);
                console.log('Patient removed using alternative method');
            }
        }

        // Then add to destination queue
        addToQueue(toQueue, patient);

        // Double-check removal
        const verifyQueue = getQueue(fromQueue);
        const stillThere = verifyQueue.find(p => String(p.id) === String(patientId));
        if (stillThere) {
            console.error('Patient still in source queue after removal! Forcing removal...');
            // Force remove by index
            const index = verifyQueue.findIndex(p => String(p.id) === String(patientId));
            if (index !== -1) {
                verifyQueue.splice(index, 1);
                saveToStorage(fromQueue, verifyQueue);
                console.log('Patient force-removed from queue');
            }
        }

        return patient;
    } else {
        console.error('Patient not found in source queue:', {
            fromQueue,
            patientId,
            queueLength: fromQueueData.length,
            queueIds: fromQueueData.map(p => p.id)
        });
    }
    return null;
}

// Get all patients (for reports)
function getAllPatients() {
    let all = [];
    Object.values(QUEUE_KEYS).forEach(key => {
        all = all.concat(getQueue(key));
    });
    // Also check custom role queues
    const customWorkflows = getCustomWorkflows();
    Object.keys(customWorkflows).forEach(role => {
        if (role !== 'admin') {
            const queue = getQueue(`queue_${role}`);
            all = all.concat(queue);
        }
    });
    return all;
}

// Search patient by ID or Token across all queues
function searchPatientById(patientId) {
    const allPatients = getAllPatients();
    const searchTerm = String(patientId).toUpperCase().trim();

    // Remove # if user included it (for token searches)
    const cleanSearch = searchTerm.startsWith('#') ? searchTerm.substring(1) : searchTerm;

    // Search by Patient ID (exact match)
    let patient = allPatients.find(p => String(p.id).toUpperCase() === searchTerm);

    // If not found, search by Token (with or without #)
    if (!patient) {
        patient = allPatients.find(p => {
            const token = String(p.token || '').toUpperCase();
            return token === cleanSearch || token === searchTerm;
        });
    }

    // Also try partial match on Patient ID (in case user enters partial ID)
    if (!patient) {
        patient = allPatients.find(p => String(p.id).toUpperCase().includes(searchTerm));
    }

    return patient;
}

// Check if current role has search access
function hasSearchAccess() {
    const config = getHospitalConfig();
    const role = getCurrentRole();
    return (config.searchAccess || []).includes(role);
}

// Current selected patient
let selectedPatient = null;

// Initialize activity page
function initActivityPage() {
    initPage('activity');
    renderActivityContent();
}

// Check if DOM is already ready, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        await initRemoteStorage();
        initActivityPage();
    });
} else {
    // DOM is already ready, initialize immediately
    (async () => {
        await initRemoteStorage();
        initActivityPage();
    })();
}

// Render content based on role
function renderActivityContent() {
    const role = getCurrentRole();
    const content = document.getElementById('activityContent');
    const title = document.getElementById('activityTitle');
    const subtitle = document.getElementById('activitySubtitle');

    if (!content) {
        console.error('activityContent element not found!');
        return;
    }

    const flows = getCustomWorkflows();
    const roleInfo = flows[role];

    // Reset view
    content.innerHTML = '';

    console.log('Rendering activity content for role:', role);

    if (role === 'admin') {
        title.textContent = '📊 Admin Dashboard';
        subtitle.textContent = 'Overview of hospital operations';
        renderAdminView(content);
        return;
    }

    // Add search bar if role has search access (before role-specific content)
    if (hasSearchAccess()) {
        content.innerHTML = renderPatientSearchBar();
        // Attach event listeners after search bar is rendered
        setTimeout(() => attachSearchEventListeners(), 0);
    }

    switch (role) {
        case 'receptionist':
            title.textContent = '📋 Reception Desk';
            subtitle.textContent = 'Register new patients and manage the waiting queue';
            renderReceptionistView(content);
            break;
        case 'doctor':
            title.textContent = '👨‍⚕️ Doctor Console';
            subtitle.textContent = 'View and treat patients in your queue';
            renderDoctorView(content);
            break;
        case 'lab_technician':
            title.textContent = '🔬 Lab Workstation';
            subtitle.textContent = 'Process lab tests and enter results';
            renderLabTechView(content);
            break;
        case 'billing':
            title.textContent = '💰 Billing Counter';
            subtitle.textContent = 'Approve admissions and process bills';
            renderBillingView(content);
            break;
        default:
            if (roleInfo) {
                title.textContent = `${roleInfo.icon} ${roleInfo.name}`;
                subtitle.textContent = roleInfo.description || 'Custom hospital workflow';
                renderCustomRoleView(content, role);
            } else {
                content.innerHTML = `
                    <div style="text-align: center; padding: 100px;">
                        <h2>Unknown Role</h2>
                        <p>This role "${role}" has not been configured in the system.</p>
                        <button class="btn btn-primary" onclick="setCurrentRole('admin'); window.location.reload();">Switch to Admin</button>
                    </div>
                `;
            }
    }
}

// ==========================================
// CUSTOM ROLE VIEW (Dynamic LCNC Rendering)
// ==========================================
function renderCustomRoleView(container, role) {
    const queueKey = `queue_${role}`;
    // Always fetch fresh queue data from storage
    const queue = loadFromStorage(queueKey, []);

    // Debug logging
    console.log(`[renderCustomRoleView] Rendering queue for ${role}:`, {
        queueKey: queueKey,
        queueLength: queue.length,
        patientIds: queue.map(p => ({ id: p.id, idType: typeof p.id, name: p.name }))
    });

    const workflows = getCustomWorkflows();
    const wf = workflows[role];
    const connections = getWorkflowConnections();
    const targets = connections[role] || [];

    // Get fields for this role's form
    const formTypeMap = { receptionist: 'receptionist', doctor: 'doctor', lab_technician: 'lab' };
    const formType = formTypeMap[role] || role;
    const fields = getFormFields(formType);

    // Verify selected patient still exists in queue, if not clear selection
    if (selectedPatient) {
        const patientStillInQueue = queue.find(p => String(p.id) === String(selectedPatient.id));
        if (!patientStillInQueue) {
            selectedPatient = null;
        } else {
            // Update selectedPatient with fresh data from queue
            selectedPatient = patientStillInQueue;
        }
    }

    // Check if search bar exists - if so, preserve it
    const searchBar = container.querySelector('.card:first-child');
    const searchResultsDiv = container.querySelector('#patientSearchResults');
    const searchBarHTML = searchBar && searchBar.querySelector('#patientSearchInput') ? searchBar.outerHTML : '';
    const searchResultsHTML = searchResultsDiv ? searchResultsDiv.outerHTML : '<div id="patientSearchResults"></div>';

    container.innerHTML = searchBarHTML + searchResultsHTML + `
        <div class="activity-layout">
            <div class="work-area" id="customWorkArea">
                ${selectedPatient ? renderCustomPatientForm(selectedPatient, fields, targets, workflows) : renderNoSelection('Select a patient from your queue to begin processing')}
            </div>
            
            <div class="queue-panel">
                <div class="queue-title" style="display: flex; justify-content: space-between; align-items: center;">
                    <span>${wf.icon} Waiting for ${wf.name} <span class="queue-count">${queue.length}</span></span>
                    <button class="btn btn-sm btn-secondary" onclick="renderActivityContent()" style="padding: 4px 8px; font-size: 0.75rem;" title="Refresh queue">
                        🔄
                    </button>
                </div>
                <div id="patientQueueList">
                    ${renderQueueList(queue, true)}
                </div>
            </div>
        </div>
    `;

    // Re-bind queue selection - use setTimeout to ensure DOM is ready
    setTimeout(() => {
        const patientCards = container.querySelectorAll('.patient-card');
        patientCards.forEach(card => {
            // Remove any existing listeners by cloning
            const newCard = card.cloneNode(true);
            card.parentNode.replaceChild(newCard, card);

            newCard.addEventListener('click', function () {
                const patientId = this.dataset.patientId;
                if (patientId) {
                    // Re-fetch queue to get latest data
                    const currentQueue = loadFromStorage(queueKey, []);
                    selectedPatient = currentQueue.find(p => String(p.id) === String(patientId));
                    if (selectedPatient) {
                        renderCustomRoleView(container, role);
                    }
                }
            });
        });

        // Use event delegation for form submission (survives re-renders)
        const workArea = container.querySelector('#customWorkArea');
        if (workArea) {
            // Remove old listener if exists
            workArea.removeEventListener('submit', handleCustomFormSubmit);
            // Add new listener
            workArea.addEventListener('submit', handleCustomFormSubmit);
            console.log('Form submit handler attached via event delegation');
        }

        // Attach search event listeners if search bar exists
        if (hasSearchAccess()) {
            attachSearchEventListeners();
        }

        // Initialize forward option styles (for radio buttons) - ensure only one appears selected
        const forwardOptions = container.querySelectorAll('.forward-option');
        forwardOptions.forEach(opt => {
            const radio = opt.querySelector('input[type="radio"]');
            if (radio && radio.checked) {
                opt.style.borderColor = 'var(--primary-color)';
                opt.style.background = 'var(--bg-card)';
            } else {
                opt.style.borderColor = 'transparent';
                opt.style.background = 'var(--bg-secondary)';
            }
        });
    }, 0);
}

// Form submission handler (defined outside to persist across re-renders)
function handleCustomFormSubmit(e) {
    // Only handle our custom form
    if (e.target.id !== 'customProcessForm') return;

    e.preventDefault();
    console.log('FORM SUBMITTED! Starting patient move process...');

    const form = e.target;
    const nextRole = form.nextRole.value;
    const role = getCurrentRole();
    const fromQueue = `queue_${role}`;
    const toQueue = nextRole === 'completed' ? 'queue_completed' : `queue_${nextRole}`;

    console.log('Form submission details:', {
        nextRole: nextRole,
        role: role,
        fromQueue: fromQueue,
        toQueue: toQueue
    });

    // Get patient ID from form data attribute
    const patientId = form.getAttribute('data-patient-id');
    if (!patientId) {
        console.error('Patient ID not found in form data attribute!');
        showNotification('Error: Patient ID missing. Please refresh the page.', 'error');
        return;
    }

    console.log('Looking for patient ID:', patientId, 'in queue:', fromQueue);

    // Get fresh patient data from queue
    const currentQueue = getQueue(fromQueue);
    console.log('Current queue contents:', currentQueue.map(p => ({ id: p.id, idType: typeof p.id, name: p.name })));

    const freshPatient = currentQueue.find(p => String(p.id) === String(patientId));

    if (!freshPatient) {
        showNotification('Error: Patient not found in queue. Please refresh the page.', 'error');
        console.error('Patient not found in queue:', {
            queueKey: fromQueue,
            patientId: patientId,
            patientIdType: typeof patientId,
            queueLength: currentQueue.length,
            queuePatientIds: currentQueue.map(p => ({ id: p.id, idType: typeof p.id, name: p.name }))
        });
        // Clear selection and refresh
        selectedPatient = null;
        renderActivityContent();
        return;
    }

    console.log('Patient found in queue:', {
        patientId: freshPatient.id,
        patientName: freshPatient.name
    });

    const workflows = getCustomWorkflows();
    const updates = {
        action: `Processed by ${workflows[role].name}`,
        notes: `Completed custom workflow form.`
    };

    // Get form fields to gather data
    const formTypeMap = { receptionist: 'receptionist', doctor: 'doctor', lab_technician: 'lab' };
    const formType = formTypeMap[role] || role;
    const fields = getFormFields(formType);

    // Gather form data and add to patient history
    const formData = {};
    fields.forEach(f => {
        const el = document.getElementById(`field_${f.id}`);
        if (el) formData[f.label] = el.value;
    });
    updates.notes = Object.entries(formData).map(([k, v]) => `${k}: ${v}`).join(', ');

    console.log('Moving patient:', {
        from: fromQueue,
        to: toQueue,
        patientId: patientId,
        patientName: freshPatient.name,
        queueBeforeMove: currentQueue.length
    });

    // Move patient using patient ID from form
    const result = movePatient(fromQueue, toQueue, patientId, updates);

    if (result) {
        // Immediately verify and force remove if still present
        let queueAfterMove = getQueue(fromQueue);
        let stillInQueue = queueAfterMove.find(p => String(p.id) === String(patientId));

        // Force remove if still present
        if (stillInQueue) {
            console.warn('Patient still in queue after movePatient. Force removing...');
            queueAfterMove = queueAfterMove.filter(p => String(p.id) !== String(patientId));
            saveToStorage(fromQueue, queueAfterMove);

            // Verify again
            const verifyQueue = getQueue(fromQueue);
            const stillThere = verifyQueue.find(p => String(p.id) === String(patientId));
            if (stillThere) {
                console.error('CRITICAL: Patient still in queue after force removal!');
                // Last resort: use splice
                const index = verifyQueue.findIndex(p => String(p.id) === String(patientId));
                if (index !== -1) {
                    verifyQueue.splice(index, 1);
                    saveToStorage(fromQueue, verifyQueue);
                    console.log('Patient removed using splice method');
                }
            } else {
                console.log('Patient successfully force-removed from queue');
            }
        } else {
            console.log('Patient successfully removed from queue');
        }

        // Final verification
        const finalQueue = getQueue(fromQueue);
        const finalCheck = finalQueue.find(p => String(p.id) === String(patientId));
        if (finalCheck) {
            console.error('FINAL CHECK FAILED: Patient still in queue!', {
                queueKey: fromQueue,
                patientId: patientId,
                queueLength: finalQueue.length,
                queueContents: finalQueue.map(p => ({ id: p.id, name: p.name }))
            });
        } else {
            console.log('FINAL CHECK PASSED: Patient removed from queue');
        }

        showNotification('Patient processed successfully!', 'success');
        selectedPatient = null;

        // Force refresh by re-rendering the activity content
        renderActivityContent();

        // Also re-render after a short delay to ensure UI is updated
        setTimeout(() => {
            renderActivityContent();
        }, 150);
    } else {
        showNotification('Error moving patient. Please try again.', 'error');
        console.error('movePatient returned null');
    }
}

// Render patient search bar
function renderPatientSearchBar() {
    return `
        <div class="card" style="margin-bottom: var(--spacing-md);">
            <div class="card-body" style="padding: var(--spacing-md);">
                <div style="display: flex; gap: var(--spacing-sm); align-items: center;">
                    <div style="flex: 1;">
                        <input type="text" 
                               id="patientSearchInput" 
                               class="form-input" 
                               placeholder="🔍 Search by Patient ID or Token (e.g., P12345678ABC or #003)"
                               style="width: 100%;"
                               onkeypress="if(event.key === 'Enter') { handlePatientSearch(); }">
                    </div>
                    <button class="btn btn-primary" onclick="handlePatientSearch(); return false;">
                        Search
                    </button>
                    <button class="btn btn-secondary" onclick="clearPatientSearch(); return false;">
                        Clear
                    </button>
                </div>
            </div>
        </div>
        <div id="patientSearchResults"></div>
    `;
}

// Attach search event listeners (called after search bar is rendered)
function attachSearchEventListeners() {
    const searchInput = document.getElementById('patientSearchInput');
    if (searchInput) {
        // Remove existing listeners by cloning
        const newInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newInput, searchInput);

        // Attach Enter key listener
        newInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handlePatientSearch();
            }
        });
    }

    // Find buttons by their onclick attributes and attach listeners
    const buttons = document.querySelectorAll('button[onclick*="handlePatientSearch"], button[onclick*="clearPatientSearch"]');
    buttons.forEach(button => {
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);

        if (newButton.getAttribute('onclick') && newButton.getAttribute('onclick').includes('handlePatientSearch')) {
            newButton.addEventListener('click', function (e) {
                e.preventDefault();
                handlePatientSearch();
            });
        } else if (newButton.getAttribute('onclick') && newButton.getAttribute('onclick').includes('clearPatientSearch')) {
            newButton.addEventListener('click', function (e) {
                e.preventDefault();
                clearPatientSearch();
            });
        }
    });
}

// Handle patient search
function handlePatientSearch() {
    const searchInput = document.getElementById('patientSearchInput');
    const resultsDiv = document.getElementById('patientSearchResults');

    if (!searchInput || !resultsDiv) return;

    const searchId = searchInput.value.trim();
    if (!searchId) {
        showNotification('Please enter a Patient ID', 'error');
        return;
    }

    const patient = searchPatientById(searchId);

    if (patient) {
        resultsDiv.innerHTML = renderPatientHistoryView(patient);
        showNotification('Patient found!', 'success');
    } else {
        resultsDiv.innerHTML = `
            <div class="card">
                <div class="card-body" style="text-align: center; padding: var(--spacing-xl);">
                    <div style="font-size: 3rem; margin-bottom: var(--spacing-md);">🔍</div>
                    <h3>Patient Not Found</h3>
                    <p style="color: var(--text-muted);">No patient found with ID: <strong>${searchId}</strong></p>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: var(--spacing-sm);">
                        Please check the Patient ID and try again.
                    </p>
                </div>
            </div>
        `;
        showNotification('Patient not found', 'error');
    }
}

// Clear patient search
function clearPatientSearch() {
    const searchInput = document.getElementById('patientSearchInput');
    const resultsDiv = document.getElementById('patientSearchResults');

    if (searchInput) searchInput.value = '';
    if (resultsDiv) resultsDiv.innerHTML = '';
    renderActivityContent(); // Re-render to show normal view
}

// Render patient history view
function renderPatientHistoryView(patient) {
    // Find which queue the patient is currently in
    const allQueues = {
        ...QUEUE_KEYS,
        completed: 'queue_completed'
    };

    let currentQueueName = 'Unknown';
    for (const [name, key] of Object.entries(allQueues)) {
        const queue = getQueue(key);
        if (queue.find(p => String(p.id) === String(patient.id))) {
            currentQueueName = name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            break;
        }
    }

    // Check custom role queues
    const customWorkflows = getCustomWorkflows();
    for (const [role, wf] of Object.entries(customWorkflows)) {
        if (role !== 'admin') {
            const queue = getQueue(`queue_${role}`);
            if (queue.find(p => String(p.id) === String(patient.id))) {
                currentQueueName = wf.name;
                break;
            }
        }
    }

    return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">📋 Patient History - ${patient.name}</h3>
                <button class="btn btn-secondary btn-sm" onclick="clearPatientSearch()">✕ Close</button>
            </div>
            <div class="card-body">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-lg);">
                    <div class="detail-item">
                        <div class="detail-label">Patient ID</div>
                        <div class="detail-value" style="font-weight: bold; color: var(--primary-color);">${patient.id}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Token</div>
                        <div class="detail-value">#${patient.token}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Name</div>
                        <div class="detail-value">${patient.name}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Age / Gender</div>
                        <div class="detail-value">${patient.age}y, ${patient.gender}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Phone</div>
                        <div class="detail-value">${patient.phone || 'N/A'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Current Status</div>
                        <div class="detail-value">${currentQueueName}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Registered</div>
                        <div class="detail-value">${formatTime(patient.registeredAt)}</div>
                    </div>
                    ${patient.address ? `
                    <div class="detail-item" style="grid-column: 1 / -1;">
                        <div class="detail-label">Address</div>
                        <div class="detail-value">${patient.address}</div>
                    </div>
                    ` : ''}
                    ${patient.complaint ? `
                    <div class="detail-item" style="grid-column: 1 / -1;">
                        <div class="detail-label">Chief Complaint</div>
                        <div class="detail-value">${patient.complaint}</div>
                    </div>
                    ` : ''}
                </div>
                
                <h4 style="margin-top: var(--spacing-lg); margin-bottom: var(--spacing-md); border-top: 2px solid var(--border-color); padding-top: var(--spacing-md);">
                    📜 Complete Journey History
                </h4>
                <div class="history-list">
                    ${(patient.history || []).length > 0 ?
            patient.history.map(h => `
                            <div class="history-item">
                                <div class="history-time">${new Date(h.time).toLocaleString()} - ${h.by}</div>
                                <div class="history-action">${h.action}</div>
                                ${h.notes ? `<div class="history-notes">${h.notes}</div>` : ''}
                            </div>
                        `).reverse().join('') :
            '<p style="color: var(--text-muted); text-align: center; padding: var(--spacing-lg);">No history available</p>'
        }
                </div>
            </div>
        </div>
    `;
}

function renderCustomPatientForm(patient, fields, targets, workflows) {
    return `
        <div class="patient-details">
            <div class="details-header">
                <div class="patient-info-large">
                    <span class="patient-token">#${patient.token}</span>
                    <span class="patient-name-large">${patient.name}</span>
                    <span class="patient-meta-large">${patient.gender}, ${patient.age}y</span>
                </div>
                <button class="btn btn-secondary" onclick="selectedPatient = null; renderActivityContent();">✕ Close</button>
            </div>
            
            <div class="details-grid">
                <div class="details-section">
                    <h3 class="section-title">📋 Processing Details</h3>
                    <form id="customProcessForm" class="registration-form" data-patient-id="${patient.id}">
                        ${fields.map(field => `
                            <div class="form-group ${field.type === 'textarea' ? 'full-width' : ''}">
                                <label class="form-label">${field.label} ${field.required ? '*' : ''}</label>
                                ${renderFieldInput(field)}
                            </div>
                        `).join('')}
                        
                        <div class="form-group full-width">
                            <label class="form-label">Forward Patient To:</label>
                            <div style="display: flex; gap: var(--spacing-sm); flex-wrap: wrap; margin-top: var(--spacing-xs);">
                                ${targets.map((t, index) => {
        const tw = workflows[t] || { name: 'Completed', icon: '✅' };
        // Set first option as checked by default, or 'completed' if available (but only one!)
        const hasCompleted = targets.includes('completed');
        const isChecked = hasCompleted ? (t === 'completed') : (index === 0);
        return `
                                        <label class="forward-option" data-option-value="${t}" style="
                                            display: flex; align-items: center; gap: 8px; padding: 12px;
                                            background: var(--bg-secondary); border-radius: var(--radius-md); 
                                            cursor: pointer; border: 2px solid transparent; 
                                            transition: var(--transition-fast);
                                        " onmouseover="if(!this.querySelector('input').checked) this.style.borderColor='var(--primary-color)'" 
                                           onmouseout="if(!this.querySelector('input').checked) this.style.borderColor='transparent'"
                                           onclick="document.querySelectorAll('.forward-option').forEach(opt => { const radio = opt.querySelector('input'); if (radio && radio !== this.querySelector('input')) { radio.checked = false; opt.style.borderColor = 'transparent'; opt.style.background = 'var(--bg-secondary)'; } }); this.querySelector('input').checked = true; this.style.borderColor = 'var(--primary-color)'; this.style.background = 'var(--bg-card)';">
                                            <input type="radio" name="nextRole" value="${t}" ${isChecked ? 'checked' : ''} required 
                                                   style="width: 18px; height: 18px; cursor: pointer;"
                                                   onchange="document.querySelectorAll('.forward-option').forEach(opt => { const radio = opt.querySelector('input'); if (radio && radio.checked) { opt.style.borderColor = 'var(--primary-color)'; opt.style.background = 'var(--bg-card)'; } else { opt.style.borderColor = 'transparent'; opt.style.background = 'var(--bg-secondary)'; } });">
                                            <span>${tw.icon} ${tw.name}</span>
                                        </label>
                                    `;
    }).join('')}
                                ${targets.length === 0 ? '<p style="color: var(--text-muted); font-style: italic;">No destinations configured. Configure flow in Templates.</p>' : ''}
                            </div>
                        </div>

                        <div class="form-group full-width" style="margin-top: var(--spacing-lg);">
                            <button type="submit" class="btn btn-primary btn-lg" ${targets.length === 0 ? 'disabled' : ''}>
                                ✓ Process & Forward Patient
                            </button>
                        </div>
                    </form>
                </div>
                
                <div class="details-section">
                    <h3 class="section-title">📜 Patient History</h3>
                    <div class="history-list">
                        ${(patient.history || []).map(h => `
                            <div class="history-item">
                                <div class="history-time">${new Date(h.time).toLocaleTimeString()} - ${h.by}</div>
                                <div class="history-action">${h.action}</div>
                                ${h.notes ? `<div class="history-notes">${h.notes}</div>` : ''}
                            </div>
                        `).reverse().join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderFieldInput(field) {
    const id = `field_${field.id}`;
    const req = field.required ? 'required' : '';

    switch (field.type) {
        case 'textarea':
            return `<textarea class="form-textarea" id="${id}" ${req} rows="3" placeholder="${field.placeholder || ''}"></textarea>`;
        case 'select':
        case 'dropdown':
            return `
                <select class="form-select" id="${id}" ${req}>
                    <option value="">Select option</option>
                    ${(field.options || []).map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                </select>
            `;
        default:
            return `<input type="${field.type === 'number' ? 'number' : 'text'}" class="form-input" id="${id}" ${req} placeholder="${field.placeholder || ''}">`;
    }
}


// ==========================================
// RECEPTIONIST VIEW
// ==========================================
function renderReceptionistView(container) {
    const doctorQueue = getQueue(QUEUE_KEYS.doctor);

    // Check if search results are being displayed - if so, don't replace
    const searchResults = document.getElementById('patientSearchResults');
    if (searchResults && searchResults.innerHTML.trim() !== '') {
        return; // Keep search results visible
    }

    // Check if search bar exists - if so, only replace content after it
    const searchBar = container.querySelector('.card:first-child');
    const searchResultsDiv = container.querySelector('#patientSearchResults');
    const searchBarHTML = searchBar && searchBar.querySelector('#patientSearchInput') ? searchBar.outerHTML : '';
    const searchResultsHTML = searchResultsDiv ? searchResultsDiv.outerHTML : '<div id="patientSearchResults"></div>';

    // Remove existing registration form if present (to avoid duplicates)
    const existingForm = container.querySelector('#registrationForm');
    if (existingForm) {
        const formParent = existingForm.closest('.activity-layout');
        if (formParent) {
            formParent.remove();
        }
    }

    container.innerHTML = searchBarHTML + searchResultsHTML + `
        <div class="activity-layout">
            <!-- Registration Form -->
            <div class="work-area">
                <div class="work-area-header">
                    <h2 class="work-area-title">📝 New Patient Registration</h2>
                </div>
                
                <form id="registrationForm" class="registration-form">
                    <div class="form-group">
                        <label class="form-label">Patient Name *</label>
                        <input type="text" class="form-input" id="patientName" required placeholder="Enter full name">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Age *</label>
                        <input type="number" class="form-input" id="patientAge" required min="0" max="150" placeholder="Age">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Gender *</label>
                        <select class="form-select" id="patientGender" required>
                            <option value="">Select Gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Phone Number *</label>
                        <input type="tel" class="form-input" id="patientPhone" required placeholder="10-digit number">
                    </div>
                    
                    <div class="form-group full-width">
                        <label class="form-label">Address</label>
                        <input type="text" class="form-input" id="patientAddress" placeholder="Full address">
                    </div>
                    
                    <div class="form-group full-width">
                        <label class="form-label">Chief Complaint *</label>
                        <textarea class="form-textarea" id="patientComplaint" required rows="3" placeholder="What is the patient's main complaint?"></textarea>
                    </div>
                    
                    <div class="form-group full-width">
                        <div class="action-buttons">
                            <button type="submit" class="btn btn-primary btn-lg">
                                ✓ Register & Send to Doctor
                            </button>
                            <button type="reset" class="btn btn-secondary btn-lg">
                                ↺ Clear Form
                            </button>
                        </div>
                    </div>
                </form>
            </div>
            
            <!-- Doctor Queue -->
            <div class="queue-panel">
                <div class="queue-title">
                    🩺 Waiting for Doctor
                    <span class="queue-count">${doctorQueue.length}</span>
                </div>
                
                <div id="doctorQueueList">
                    ${renderQueueList(doctorQueue, false)}
                </div>
            </div>
        </div>
    `;

    // Handle registration form submission
    document.getElementById('registrationForm').addEventListener('submit', function (e) {
        e.preventDefault();

        const patient = {
            id: generatePatientId(),
            token: generateToken(),
            name: document.getElementById('patientName').value,
            age: document.getElementById('patientAge').value,
            gender: document.getElementById('patientGender').value,
            phone: document.getElementById('patientPhone').value,
            address: document.getElementById('patientAddress').value,
            complaint: document.getElementById('patientComplaint').value,
            registeredAt: new Date().toISOString(),
            registeredBy: 'Receptionist',
            currentQueue: QUEUE_KEYS.doctor,
            status: 'waiting',
            history: [{
                action: 'Patient Registered',
                by: 'Receptionist',
                time: new Date().toISOString(),
                notes: `Chief complaint: ${document.getElementById('patientComplaint').value}`
            }]
        };

        addToQueue(QUEUE_KEYS.doctor, patient);
        showNotification(`Patient ${patient.name} registered! Patient ID: ${patient.id}, Token: #${patient.token}`, 'success');

        this.reset();
        renderReceptionistView(container);
    });

    // Attach search event listeners if search bar exists
    if (hasSearchAccess()) {
        setTimeout(() => attachSearchEventListeners(), 0);
    }
}

// ==========================================
// DOCTOR VIEW
// ==========================================
let doctorViewTab = 'opd'; // 'opd' or 'ipd'

function renderDoctorView(container) {
    const opdQueue = getQueue(QUEUE_KEYS.doctor);
    const ipdQueue = getQueue(QUEUE_KEYS.ipd);

    // Check if search results are being displayed - if so, don't replace
    const searchResults = document.getElementById('patientSearchResults');
    if (searchResults && searchResults.innerHTML.trim() !== '') {
        return; // Keep search results visible
    }

    // Check if search bar exists - if so, only replace content after it
    const searchBar = container.querySelector('.card:first-child');
    const searchResultsDiv = container.querySelector('#patientSearchResults');
    const searchBarHTML = searchBar && searchBar.querySelector('#patientSearchInput') ? searchBar.outerHTML : '';
    const searchResultsHTML = searchResultsDiv ? searchResultsDiv.outerHTML : '<div id="patientSearchResults"></div>';

    // Remove existing doctor view if present (to avoid duplicates)
    const existingView = container.querySelector('.activity-layout');
    if (existingView) {
        existingView.remove();
    }

    container.innerHTML = searchBarHTML + searchResultsHTML + `
        <div class="activity-layout">
            <!-- Work Area -->
            <div class="work-area" id="doctorWorkArea">
                ${selectedPatient ? renderDoctorPatientView(selectedPatient) : renderNoSelection('Select a patient from the queue to begin consultation')}
            </div>
            
            <!-- Patient Queues with Tabs -->
            <div class="queue-panel">
                <!-- Tab Buttons -->
                <div style="display: flex; gap: var(--spacing-xs); margin-bottom: var(--spacing-md);">
                    <button class="btn ${doctorViewTab === 'opd' ? 'btn-primary' : 'btn-secondary'}" 
                            onclick="switchDoctorTab('opd')" style="flex: 1;">
                        🩺 OPD <span class="queue-count">${opdQueue.length}</span>
                    </button>
                    <button class="btn ${doctorViewTab === 'ipd' ? 'btn-primary' : 'btn-secondary'}" 
                            onclick="switchDoctorTab('ipd')" style="flex: 1;">
                        🛏️ IPD <span class="queue-count">${ipdQueue.length}</span>
                    </button>
                </div>
                
                <div class="queue-title">
                    ${doctorViewTab === 'opd' ? '👥 OPD Patients' : '🛏️ Admitted Patients'}
                </div>
                
                <div id="patientQueueList">
                    ${doctorViewTab === 'opd'
            ? renderQueueList(opdQueue, true)
            : renderIPDQueueList(ipdQueue)}
                </div>
            </div>
        </div>
    `;

    // Add click handlers for patient cards
    document.querySelectorAll('.patient-card').forEach(card => {
        card.addEventListener('click', function () {
            const patientId = this.dataset.patientId;
            const queue = doctorViewTab === 'opd' ? getQueue(QUEUE_KEYS.doctor) : getQueue(QUEUE_KEYS.ipd);
            selectedPatient = queue.find(p => p.id === patientId);
            renderDoctorView(container);
        });
    });

    // Handle doctor actions
    setupDoctorActions(container);

    // Attach search event listeners if search bar exists
    if (hasSearchAccess()) {
        setTimeout(() => attachSearchEventListeners(), 0);
    }
}

function switchDoctorTab(tab) {
    doctorViewTab = tab;
    selectedPatient = null;
    renderDoctorView(document.getElementById('activityContent'));
}

function renderIPDQueueList(queue) {
    if (queue.length === 0) {
        return `
            <div class="queue-empty">
                <div class="queue-empty-icon">🛏️</div>
                <p>No admitted patients</p>
            </div>
        `;
    }

    return queue.map(patient => `
        <div class="patient-card ${selectedPatient && selectedPatient.id === patient.id ? 'selected' : ''}" 
             data-patient-id="${patient.id}">
            <div class="patient-card-header">
                <span class="patient-name">${patient.name}</span>
                <span class="patient-token" style="background: var(--info-color);">🛏️ ${patient.bedNumber || 'TBD'}</span>
            </div>
            <div class="patient-info">${patient.age}y, ${patient.gender} • ${patient.diagnosis || patient.complaint}</div>
            <div class="patient-time">📅 Admitted: ${formatTime(patient.admittedAt || patient.registeredAt)}</div>
        </div>
    `).join('');
}

function renderDoctorPatientView(patient) {
    const isIPD = patient.currentQueue === QUEUE_KEYS.ipd;

    return `
        <div class="work-area-header">
            <h2 class="work-area-title">${isIPD ? '🛏️ In-Patient Care' : '🩺 Patient Consultation'}</h2>
            <span class="status-badge ${isIPD ? 'waiting' : 'in-progress'}">
                ${isIPD ? '🛏️ Admitted - Bed ' + (patient.bedNumber || 'TBD') : '🔵 In Progress'}
            </span>
        </div>
        
        <div class="patient-details">
            <div class="patient-details-header">
                <div class="patient-avatar">${isIPD ? '🛏️' : '👤'}</div>
                <div class="patient-primary-info">
                    <h3>${patient.name}</h3>
                    <p>Token #${patient.token} • ${patient.age} years • ${patient.gender}</p>
                </div>
            </div>
            
            <div class="patient-details-grid">
                <div class="detail-item">
                    <div class="detail-label">Phone</div>
                    <div class="detail-value">${patient.phone}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">${isIPD ? 'Admitted' : 'Registered'}</div>
                    <div class="detail-value">${formatTime(isIPD ? patient.admittedAt : patient.registeredAt)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Chief Complaint</div>
                    <div class="detail-value">${patient.complaint}</div>
                </div>
                ${isIPD && patient.bedNumber ? `
                    <div class="detail-item">
                        <div class="detail-label">Bed/Room</div>
                        <div class="detail-value">${patient.bedNumber}</div>
                    </div>
                ` : ''}
            </div>
            
            ${patient.labResults ? `
                <div class="history-section">
                    <h4 class="history-title">🔬 Lab Results</h4>
                    <div class="test-results-form">
                        ${patient.labResults}
                    </div>
                </div>
            ` : ''}
        </div>
        
        <!-- Doctor Notes Form -->
        <form id="diagnosisForm">
            <div class="form-group">
                <label class="form-label">${isIPD ? 'Current Diagnosis / Update' : 'Diagnosis'} *</label>
                <textarea class="form-textarea" id="diagnosis" rows="2" required placeholder="Enter diagnosis">${patient.diagnosis || ''}</textarea>
            </div>
            
            <div class="form-group">
                <label class="form-label">Prescription / Treatment</label>
                <textarea class="form-textarea" id="prescription" rows="3" placeholder="Enter medicines and instructions">${patient.prescription || ''}</textarea>
            </div>
            
            <div class="form-group">
                <label class="form-label">${isIPD ? 'Daily Notes / Rounds' : 'Notes'}</label>
                <textarea class="form-textarea" id="doctorNotes" rows="2" placeholder="${isIPD ? 'Add daily round notes' : 'Additional notes'}">${patient.doctorNotes || ''}</textarea>
            </div>
            
            ${isIPD ? `
                <!-- IPD Actions -->
                <div class="action-buttons">
                    <button type="button" class="btn btn-primary" onclick="handleSendToLab()">
                        🔬 Order Lab Tests
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="handleSaveIPD()">
                        💾 Save All
                    </button>
                    <button type="button" class="btn btn-success" onclick="handleDischarge()">
                        ✓ Discharge Patient
                    </button>
                </div>
            ` : `
                <!-- OPD Actions -->
                <div class="action-buttons">
                    <button type="button" class="btn btn-primary" id="sendToLab">
                        � Send to Lab
                    </button>
                    <button type="button" class="btn btn-secondary" id="admitPatient">
                        🛏️ Admit to Bed
                    </button>
                    ${(() => {
            // Get workflow connections to show dynamic buttons for custom roles
            const connections = getWorkflowConnections();
            const workflows = getCustomWorkflows();
            const doctorTargets = (connections['doctor'] || []).filter(t =>
                t !== 'lab_technician' && t !== 'billing' && t !== 'completed' && t !== 'ipd'
            );

            console.log('Doctor targets from connections:', doctorTargets);
            console.log('Available workflows:', Object.keys(workflows));
            console.log('Doctor connections:', connections['doctor']);

            if (doctorTargets.length === 0) return '';

            return doctorTargets.map(targetId => {
                const wf = workflows[targetId];
                if (!wf) {
                    console.warn(`Workflow not found for targetId: ${targetId}`);
                    return '';
                }
                console.log(`Creating button for: ${targetId} (${wf.name})`);
                return `<button type="button" class="btn btn-secondary" id="sendTo_${targetId}" style="background: ${wf.color};">
                                ${wf.icon} Send to ${wf.name}
                            </button>`;
            }).join('');
        })()}
                    <button type="button" class="btn btn-success" id="sendToBilling">
                        ✓ Complete (OPD)
                    </button>
                </div>
            `}
        </form>
        
        <!-- History -->
        ${renderPatientHistory(patient)}
    `;
}

function setupDoctorActions(container) {
    const sendToLabBtn = document.getElementById('sendToLab');
    const sendToBillingBtn = document.getElementById('sendToBilling');
    const admitBtn = document.getElementById('admitPatient');
    const updateIPDBtn = document.getElementById('updateIPD');
    const dischargeBtn = document.getElementById('dischargePatient');

    // Send to Lab (both OPD and IPD)
    if (sendToLabBtn) {
        sendToLabBtn.addEventListener('click', function () {
            const diagnosis = document.getElementById('diagnosis').value;
            const prescription = document.getElementById('prescription').value;
            const notes = document.getElementById('doctorNotes').value;

            if (!diagnosis) {
                showNotification('Please enter a diagnosis', 'error');
                return;
            }

            // Clear previous lab tests for new round
            const patientData = { ...selectedPatient };
            patientData.labTests = [];

            movePatient(selectedPatient.currentQueue, QUEUE_KEYS.lab, selectedPatient.id, {
                action: 'Sent to Lab',
                diagnosis: diagnosis,
                prescription: prescription,
                doctorNotes: notes,
                labTests: [],
                labResults: null,
                notes: 'Requires lab tests'
            });

            showNotification(`Patient sent to Lab for tests`, 'success');
            selectedPatient = null;
            renderDoctorView(container);
        });
    }

    // Complete OPD (discharge without admission)
    if (sendToBillingBtn) {
        sendToBillingBtn.addEventListener('click', function () {
            const diagnosis = document.getElementById('diagnosis').value;
            const prescription = document.getElementById('prescription').value;
            const notes = document.getElementById('doctorNotes').value;

            if (!diagnosis) {
                showNotification('Please enter a diagnosis', 'error');
                return;
            }

            movePatient(QUEUE_KEYS.doctor, QUEUE_KEYS.completed, selectedPatient.id, {
                action: 'OPD Treatment Completed',
                diagnosis: diagnosis,
                prescription: prescription,
                doctorNotes: notes,
                status: 'completed',
                patientType: 'OPD',
                completedAt: new Date().toISOString(),
                notes: 'OPD visit completed'
            });

            showNotification(`OPD treatment completed!`, 'success');
            selectedPatient = null;
            renderDoctorView(container);
        });
    }

    // Admit Patient (OPD to IPD)
    if (admitBtn) {
        admitBtn.addEventListener('click', function () {
            const diagnosis = document.getElementById('diagnosis').value;
            const prescription = document.getElementById('prescription').value;
            const notes = document.getElementById('doctorNotes').value;

            if (!diagnosis) {
                showNotification('Please enter a diagnosis before admission', 'error');
                return;
            }

            // Show bed selection modal
            showBedSelectionModal(diagnosis, prescription, notes, container);
        });
    }

    // Dynamic buttons for custom roles (e.g., Pharmacist, Yoga)
    // Use setTimeout with retry logic to ensure DOM is ready
    let retryCount = 0;
    const maxRetries = 5;

    const setupDynamicButtons = () => {
        const connections = getWorkflowConnections();
        const workflows = getCustomWorkflows();
        const doctorTargets = (connections['doctor'] || []).filter(t =>
            t !== 'lab_technician' && t !== 'billing' && t !== 'completed' && t !== 'ipd'
        );

        console.log('Setting up event handlers for doctor targets:', doctorTargets);
        console.log('Available workflows:', Object.keys(workflows));

        let allButtonsFound = true;

        doctorTargets.forEach(targetId => {
            const btn = document.getElementById(`sendTo_${targetId}`);
            console.log(`Looking for button: sendTo_${targetId}, found:`, btn);
            if (btn) {
                // Remove existing listener if any (to prevent duplicates)
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);

                newBtn.addEventListener('click', function () {
                    console.log(`Button clicked for: ${targetId}`);
                    const diagnosis = document.getElementById('diagnosis').value;
                    const prescription = document.getElementById('prescription').value;
                    const notes = document.getElementById('doctorNotes').value;
                    const wf = workflows[targetId];

                    if (!diagnosis) {
                        showNotification('Please enter a diagnosis', 'error');
                        return;
                    }

                    movePatient(selectedPatient.currentQueue, `queue_${targetId}`, selectedPatient.id, {
                        action: `Sent to ${wf.name}`,
                        diagnosis: diagnosis,
                        prescription: prescription,
                        doctorNotes: notes,
                        notes: `Forwarded to ${wf.name} for processing`
                    });

                    showNotification(`Patient sent to ${wf.name}`, 'success');
                    selectedPatient = null;
                    renderDoctorView(container);
                });
            } else {
                allButtonsFound = false;
                if (retryCount < maxRetries) {
                    console.log(`Button sendTo_${targetId} not found yet, will retry...`);
                } else {
                    console.warn(`Button not found for targetId: ${targetId} after ${maxRetries} retries. Button ID should be: sendTo_${targetId}`);
                }
            }
        });

        // Retry if buttons not found yet
        if (!allButtonsFound && retryCount < maxRetries) {
            retryCount++;
            setTimeout(setupDynamicButtons, 150);
        } else if (allButtonsFound) {
            console.log('All dynamic buttons set up successfully!');
        }
    };

    setTimeout(setupDynamicButtons, 200);

    // Update IPD Notes
    if (updateIPDBtn) {
        updateIPDBtn.addEventListener('click', function () {
            const diagnosis = document.getElementById('diagnosis').value;
            const prescription = document.getElementById('prescription').value;
            const notes = document.getElementById('doctorNotes').value;

            // Update patient in queue
            const queue = getQueue(QUEUE_KEYS.ipd);
            const patientIndex = queue.findIndex(p => p.id === selectedPatient.id);

            if (patientIndex !== -1) {
                // Save diagnosis and prescription (they persist)
                queue[patientIndex].diagnosis = diagnosis;
                queue[patientIndex].prescription = prescription;
                // Clear notes after saving (each round is new)
                queue[patientIndex].doctorNotes = '';  // Clear for next round
                queue[patientIndex].updatedAt = new Date().toISOString();

                // Build history notes with all details from this round
                let historyNote = '';
                if (diagnosis) historyNote += `Diagnosis: ${diagnosis}`;
                if (prescription) historyNote += `\nPrescription: ${prescription}`;
                if (notes) historyNote += `\nRound Notes: ${notes}`;

                // Add to history
                if (!queue[patientIndex].history) queue[patientIndex].history = [];
                queue[patientIndex].history.push({
                    action: 'Doctor Rounds',
                    by: 'Doctor',
                    time: new Date().toISOString(),
                    notes: historyNote || 'Daily rounds completed'
                });

                saveToStorage(QUEUE_KEYS.ipd, queue);
                selectedPatient = queue[patientIndex];

                showNotification('Rounds saved! Notes cleared for next entry.', 'success');
                renderDoctorView(container);
            }
        });
    }

    // Discharge Patient
    if (dischargeBtn) {
        dischargeBtn.addEventListener('click', function () {
            const diagnosis = document.getElementById('diagnosis').value;
            const prescription = document.getElementById('prescription').value;
            const notes = document.getElementById('doctorNotes').value;

            if (!diagnosis) {
                showNotification('Please enter final diagnosis', 'error');
                return;
            }

            if (!selectedPatient) {
                showNotification('No patient selected. Please select a patient first.', 'error');
                return;
            }

            // Get the current queue for this patient - should be IPD
            const fromQueue = selectedPatient.currentQueue;

            // Debug: Check if patient exists in the queue
            const queueData = getQueue(fromQueue);
            const patientInQueue = queueData.find(p => p.id === selectedPatient.id);

            if (!patientInQueue) {
                showNotification(`Error: Patient not found in ${fromQueue}. Please refresh the page.`, 'error');
                console.error('Patient not found:', selectedPatient.id, 'in queue:', fromQueue);
                return;
            }

            if (confirm('Discharge this patient? They will be sent to billing for final settlement.')) {
                const result = movePatient(fromQueue, QUEUE_KEYS.billing, selectedPatient.id, {
                    action: 'Discharge Initiated',
                    diagnosis: diagnosis,
                    prescription: prescription,
                    doctorNotes: notes,
                    dischargeSummary: `Final Diagnosis: ${diagnosis}\nTreatment: ${prescription}\nNotes: ${notes}`,
                    dischargeInitiatedAt: new Date().toISOString(),
                    billType: 'discharge',
                    notes: 'Pending final billing'
                });

                if (result) {
                    showNotification(`Discharge initiated for ${selectedPatient.name}. Sent to billing.`, 'success');
                } else {
                    showNotification('Failed to discharge patient. Please try again.', 'error');
                }

                selectedPatient = null;
                doctorViewTab = 'ipd';
                renderDoctorView(container);
            }
        });
    }
}

// ==========================================
// GLOBAL IPD ACTION HANDLERS (for onclick)
// ==========================================
function handleSendToLab() {
    const diagnosis = document.getElementById('diagnosis').value;
    const prescription = document.getElementById('prescription').value;
    const notes = document.getElementById('doctorNotes').value;

    if (!diagnosis) {
        showNotification('Please enter a diagnosis', 'error');
        return;
    }

    if (!selectedPatient) {
        showNotification('No patient selected', 'error');
        return;
    }

    movePatient(selectedPatient.currentQueue, QUEUE_KEYS.lab, selectedPatient.id, {
        action: 'Sent to Lab',
        diagnosis: diagnosis,
        prescription: prescription,
        doctorNotes: notes,
        labTests: [],
        labResults: null,
        notes: 'Requires lab tests'
    });

    showNotification('Patient sent to Lab for tests', 'success');
    selectedPatient = null;
    renderDoctorView(document.getElementById('activityContent'));
}

function handleSaveIPD() {
    const diagnosis = document.getElementById('diagnosis').value;
    const prescription = document.getElementById('prescription').value;
    const notes = document.getElementById('doctorNotes').value;

    if (!selectedPatient) {
        showNotification('No patient selected', 'error');
        return;
    }

    const queue = getQueue(QUEUE_KEYS.ipd);
    const patientIndex = queue.findIndex(p => p.id === selectedPatient.id);

    if (patientIndex !== -1) {
        queue[patientIndex].diagnosis = diagnosis;
        queue[patientIndex].prescription = prescription;
        queue[patientIndex].doctorNotes = '';
        queue[patientIndex].updatedAt = new Date().toISOString();

        let historyNote = '';
        if (diagnosis) historyNote += `Diagnosis: ${diagnosis}`;
        if (prescription) historyNote += `\nPrescription: ${prescription}`;
        if (notes) historyNote += `\nRound Notes: ${notes}`;

        if (!queue[patientIndex].history) queue[patientIndex].history = [];
        queue[patientIndex].history.push({
            action: 'Doctor Rounds',
            by: 'Doctor',
            time: new Date().toISOString(),
            notes: historyNote || 'Daily rounds completed'
        });

        saveToStorage(QUEUE_KEYS.ipd, queue);
        selectedPatient = queue[patientIndex];

        showNotification('Rounds saved! Notes cleared for next entry.', 'success');
        renderDoctorView(document.getElementById('activityContent'));
    }
}

function handleDischarge() {
    const diagnosis = document.getElementById('diagnosis').value;
    const prescription = document.getElementById('prescription').value;
    const notes = document.getElementById('doctorNotes').value;

    if (!diagnosis) {
        showNotification('Please enter final diagnosis', 'error');
        return;
    }

    if (!selectedPatient) {
        showNotification('No patient selected. Please select a patient first.', 'error');
        return;
    }

    const fromQueue = selectedPatient.currentQueue;
    const queueData = getQueue(fromQueue);
    const patientInQueue = queueData.find(p => p.id === selectedPatient.id);

    if (!patientInQueue) {
        showNotification('Error: Patient not found. Please refresh.', 'error');
        return;
    }

    // Show custom confirmation modal instead of confirm()
    showDischargeConfirmModal(diagnosis, prescription, notes, fromQueue);
}

function showDischargeConfirmModal(diagnosis, prescription, notes, fromQueue) {
    const modal = document.createElement('div');
    modal.id = 'dischargeModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center;
        z-index: 2000;
    `;

    modal.innerHTML = `
        <div style="background: var(--bg-card); border-radius: var(--radius-lg); padding: var(--spacing-xl); width: 450px; max-width: 90%; text-align: center;">
            <h3 style="margin-bottom: var(--spacing-lg); color: var(--accent-color);">📤 Confirm Discharge</h3>
            
            <p style="margin-bottom: var(--spacing-md); color: var(--text-secondary);">
                Are you sure you want to discharge <strong>${selectedPatient.name}</strong>?
            </p>
            <p style="margin-bottom: var(--spacing-lg); color: var(--text-muted); font-size: 0.9rem;">
                The patient will be sent to Billing for final settlement.
            </p>
            
            <div class="action-buttons" style="justify-content: center;">
                <button type="button" class="btn btn-secondary" onclick="closeDischargeModal()">
                    Cancel
                </button>
                <button type="button" class="btn btn-success" onclick="confirmDischargeAction('${diagnosis.replace(/'/g, "\\'")}', '${prescription.replace(/'/g, "\\'")}', '${notes.replace(/'/g, "\\'")}', '${fromQueue}')">
                    ✓ Yes, Discharge
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function closeDischargeModal() {
    const modal = document.getElementById('dischargeModal');
    if (modal) modal.remove();
}

function confirmDischargeAction(diagnosis, prescription, notes, fromQueue) {
    closeDischargeModal();

    const result = movePatient(fromQueue, QUEUE_KEYS.billing, selectedPatient.id, {
        action: 'Discharge Initiated',
        diagnosis: diagnosis,
        prescription: prescription,
        doctorNotes: notes,
        dischargeSummary: `Final Diagnosis: ${diagnosis}\nTreatment: ${prescription}\nNotes: ${notes}`,
        dischargeInitiatedAt: new Date().toISOString(),
        billType: 'discharge',
        notes: 'Pending final billing'
    });

    if (result) {
        showNotification(`Discharge initiated for ${selectedPatient.name}. Sent to billing.`, 'success');
    } else {
        showNotification('Failed to discharge. Please try again.', 'error');
    }

    selectedPatient = null;
    doctorViewTab = 'ipd';
    renderDoctorView(document.getElementById('activityContent'));
}

// Bed Selection Modal
function showBedSelectionModal(diagnosis, prescription, notes, container) {
    const modal = document.createElement('div');
    modal.id = 'bedModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center;
        z-index: 2000;
    `;

    modal.innerHTML = `
        <div style="background: var(--bg-card); border-radius: var(--radius-lg); padding: var(--spacing-xl); width: 400px; max-width: 90%;">
            <h3 style="margin-bottom: var(--spacing-lg);">🛏️ Admit Patient</h3>
            
            <div class="form-group">
                <label class="form-label">Ward Type *</label>
                <select class="form-select" id="wardType">
                    <option value="General">General Ward</option>
                    <option value="Semi-Private">Semi-Private Room</option>
                    <option value="Private">Private Room</option>
                    <option value="ICU">ICU</option>
                    <option value="Emergency">Emergency Ward</option>
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label">Bed/Room Number *</label>
                <input type="text" class="form-input" id="bedNumber" placeholder="e.g., G-101, ICU-5" required>
            </div>
            
            <div class="form-group">
                <label class="form-label">Admission Notes</label>
                <textarea class="form-textarea" id="admissionNotes" rows="2" placeholder="Reason for admission"></textarea>
            </div>
            
            <div class="action-buttons">
                <button type="button" class="btn btn-secondary" onclick="closeBedModal()">Cancel</button>
                <button type="button" class="btn btn-primary" onclick="confirmAdmission('${diagnosis.replace(/'/g, "\\'")}', '${prescription.replace(/'/g, "\\'")}', '${notes.replace(/'/g, "\\'")}')">
                    ✓ Confirm Admission
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function closeBedModal() {
    const modal = document.getElementById('bedModal');
    if (modal) modal.remove();
}

function confirmAdmission(diagnosis, prescription, notes) {
    const wardType = document.getElementById('wardType').value;
    const bedNumber = document.getElementById('bedNumber').value;
    const admissionNotes = document.getElementById('admissionNotes').value;

    if (!bedNumber) {
        showNotification('Please enter bed/room number', 'error');
        return;
    }

    movePatient(QUEUE_KEYS.doctor, QUEUE_KEYS.billing, selectedPatient.id, {
        action: 'Admission Requested',
        diagnosis: diagnosis,
        prescription: prescription,
        doctorNotes: notes,
        wardType: wardType,
        bedNumber: bedNumber,
        admissionNotes: admissionNotes,
        admissionRequestedAt: new Date().toISOString(),
        billType: 'admission',
        notes: `Admission to ${wardType} - Bed ${bedNumber}`
    });

    closeBedModal();
    showNotification(`Admission request sent to Billing`, 'success');
    selectedPatient = null;
    renderDoctorView(document.getElementById('activityContent'));
}

// ==========================================
// LAB TECHNICIAN VIEW
// ==========================================
function renderLabTechView(container) {
    const myQueue = getQueue(QUEUE_KEYS.lab);

    // Check if search results are being displayed - if so, don't replace
    const searchResults = document.getElementById('patientSearchResults');
    if (searchResults && searchResults.innerHTML.trim() !== '') {
        return; // Keep search results visible
    }

    // Check if search bar exists - if so, only replace content after it
    const searchBar = container.querySelector('.card:first-child');
    const searchResultsDiv = container.querySelector('#patientSearchResults');
    const searchBarHTML = searchBar && searchBar.querySelector('#patientSearchInput') ? searchBar.outerHTML : '';
    const searchResultsHTML = searchResultsDiv ? searchResultsDiv.outerHTML : '<div id="patientSearchResults"></div>';

    // Remove existing lab view if present (to avoid duplicates)
    const existingView = container.querySelector('.activity-layout');
    if (existingView) {
        existingView.remove();
    }

    container.innerHTML = searchBarHTML + searchResultsHTML + `
        <div class="activity-layout">
            <!-- Work Area -->
            <div class="work-area" id="labWorkArea">
                ${selectedPatient ? renderLabPatientView(selectedPatient) : renderNoSelection('Select a patient from the queue to enter test results')}
            </div>
            
            <!-- Patient Queue -->
            <div class="queue-panel">
                <div class="queue-title">
                    🧪 Lab Queue
                    <span class="queue-count">${myQueue.length}</span>
                </div>
                
                <div id="labQueueList">
                    ${renderQueueList(myQueue, true)}
                </div>
            </div>
        </div>
    `;

    // Add click handlers for patient cards
    document.querySelectorAll('.patient-card').forEach(card => {
        card.addEventListener('click', function () {
            const patientId = this.dataset.patientId;
            const queue = getQueue(QUEUE_KEYS.lab);
            selectedPatient = queue.find(p => p.id === patientId);
            renderLabTechView(container);
        });
    });

    // Handle lab actions
    setupLabActions(container);

    // Attach search event listeners if search bar exists
    if (hasSearchAccess()) {
        setTimeout(() => attachSearchEventListeners(), 0);
    }
}

function renderLabPatientView(patient) {
    return `
        <div class="work-area-header">
            <h2 class="work-area-title">Lab Test Entry</h2>
            <span class="status-badge in-progress">🔵 Processing</span>
        </div>
        
        <div class="patient-details">
            <div class="patient-details-header">
                <div class="patient-avatar">👤</div>
                <div class="patient-primary-info">
                    <h3>${patient.name}</h3>
                    <p>Token #${patient.token} • ${patient.age} years • ${patient.gender}</p>
                </div>
            </div>
            
            <div class="patient-details-grid">
                <div class="detail-item">
                    <div class="detail-label">Doctor's Diagnosis</div>
                    <div class="detail-value">${patient.diagnosis || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Doctor's Notes</div>
                    <div class="detail-value">${patient.doctorNotes || 'N/A'}</div>
                </div>
            </div>
        </div>
        
        <!-- Tests Already Done -->
        ${renderTestsList(patient)}
        
        <!-- Add New Test Form -->
        <form id="labResultsForm" style="margin-top: var(--spacing-lg);">
            <h4 style="margin-bottom: var(--spacing-md);">➕ Add New Test</h4>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-md);">
                <div class="form-group">
                    <label class="form-label">Test Type *</label>
                    <select class="form-select" id="testType" required>
                        <option value="">Select Test</option>
                        <option value="Blood Test (CBC)">Blood Test (CBC)</option>
                        <option value="Urine Test">Urine Test</option>
                        <option value="X-Ray">X-Ray</option>
                        <option value="Blood Sugar (Fasting)">Blood Sugar (Fasting)</option>
                        <option value="Blood Sugar (PP)">Blood Sugar (PP)</option>
                        <option value="HbA1c">HbA1c</option>
                        <option value="Thyroid Profile">Thyroid Profile</option>
                        <option value="Lipid Profile">Lipid Profile</option>
                        <option value="Liver Function Test">Liver Function Test</option>
                        <option value="Kidney Function Test">Kidney Function Test</option>
                        <option value="ECG">ECG</option>
                        <option value="Ultrasound">Ultrasound</option>
                        <option value="CT Scan">CT Scan</option>
                        <option value="MRI">MRI</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Status *</label>
                    <select class="form-select" id="testStatus" required>
                        <option value="Normal">Normal</option>
                        <option value="Abnormal">Abnormal</option>
                        <option value="Critical">Critical</option>
                        <option value="Pending">Pending Further Review</option>
                    </select>
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Results/Values *</label>
                <textarea class="form-textarea" id="testResults" rows="3" required placeholder="Enter test values and results"></textarea>
            </div>
            
            <div class="form-group">
                <label class="form-label">Remarks (Optional)</label>
                <input type="text" class="form-input" id="labRemarks" placeholder="Any additional observations">
            </div>
            
            <div class="action-buttons">
                <button type="button" class="btn btn-primary" id="addTest">
                    ➕ Add This Test
                </button>
                <button type="button" class="btn btn-success" id="sendBackToDoctor">
                    ✓ All Tests Done - Send to Doctor
                </button>
            </div>
        </form>
        
        <!-- History -->
        ${renderPatientHistory(patient)}
    `;
}

function renderTestsList(patient) {
    const tests = patient.labTests || [];

    if (tests.length === 0) {
        return `
            <div style="background: var(--bg-secondary); border-radius: var(--radius-md); padding: var(--spacing-lg); margin-top: var(--spacing-lg); text-align: center;">
                <div style="font-size: 2rem; margin-bottom: var(--spacing-sm);">🧪</div>
                <p style="color: var(--text-muted);">No tests added yet. Add tests below.</p>
            </div>
        `;
    }

    return `
        <div style="margin-top: var(--spacing-lg);">
            <h4 style="margin-bottom: var(--spacing-md);">📋 Tests Completed (${tests.length})</h4>
            <div style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
                ${tests.map((test, index) => `
                    <div class="test-item" style="display: flex; align-items: flex-start; gap: var(--spacing-md); padding: var(--spacing-md); background: var(--bg-secondary); border-radius: var(--radius-md); border-left: 4px solid ${getStatusColor(test.status)};">
                        <div style="flex-shrink: 0; width: 32px; height: 32px; background: var(--bg-card); border-radius: var(--radius-full); display: flex; align-items: center; justify-content: center; font-weight: bold;">
                            ${index + 1}
                        </div>
                        <div style="flex: 1;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-xs);">
                                <strong>${test.type}</strong>
                                <span class="status-badge ${test.status === 'Normal' ? 'completed' : test.status === 'Critical' ? '' : 'waiting'}" style="${test.status === 'Critical' ? 'background: rgba(229, 62, 62, 0.2); color: var(--danger-color);' : ''}">
                                    ${test.status}
                                </span>
                            </div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary); white-space: pre-wrap;">${test.results}</div>
                            ${test.remarks ? `<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: var(--spacing-xs);"><em>Remarks: ${test.remarks}</em></div>` : ''}
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: var(--spacing-xs);">
                                Added at ${formatTime(test.addedAt)}
                            </div>
                        </div>
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeTest(${index})" style="flex-shrink: 0;">
                            ✕
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function getStatusColor(status) {
    switch (status) {
        case 'Normal': return 'var(--secondary-color)';
        case 'Abnormal': return 'var(--accent-color)';
        case 'Critical': return 'var(--danger-color)';
        default: return 'var(--info-color)';
    }
}

function addTestToPatient(test) {
    if (!selectedPatient) return;

    const queue = getQueue(QUEUE_KEYS.lab);
    const patientIndex = queue.findIndex(p => p.id === selectedPatient.id);

    if (patientIndex === -1) return;

    if (!queue[patientIndex].labTests) {
        queue[patientIndex].labTests = [];
    }

    queue[patientIndex].labTests.push(test);
    saveToStorage(QUEUE_KEYS.lab, queue);
    selectedPatient = queue[patientIndex];
}

function removeTest(testIndex) {
    if (!selectedPatient) return;

    const queue = getQueue(QUEUE_KEYS.lab);
    const patientIndex = queue.findIndex(p => p.id === selectedPatient.id);

    if (patientIndex === -1) return;

    if (queue[patientIndex].labTests && queue[patientIndex].labTests[testIndex]) {
        queue[patientIndex].labTests.splice(testIndex, 1);
    }

    saveToStorage(QUEUE_KEYS.lab, queue);
    selectedPatient = queue[patientIndex];
    renderLabTechView(document.getElementById('activityContent'));
    showNotification('Test removed', 'info');
}

function setupLabActions(container) {
    const addTestBtn = document.getElementById('addTest');
    const sendBackBtn = document.getElementById('sendBackToDoctor');

    if (addTestBtn) {
        addTestBtn.addEventListener('click', function () {
            const testType = document.getElementById('testType').value;
            const testStatus = document.getElementById('testStatus').value;
            const results = document.getElementById('testResults').value;
            const remarks = document.getElementById('labRemarks').value;

            if (!testType || !results) {
                showNotification('Please select test type and enter results', 'error');
                return;
            }

            const test = {
                type: testType,
                status: testStatus,
                results: results,
                remarks: remarks,
                addedAt: new Date().toISOString(),
                addedBy: 'Lab Technician'
            };

            addTestToPatient(test);
            showNotification(`${testType} added successfully!`, 'success');

            document.getElementById('testType').value = '';
            document.getElementById('testResults').value = '';
            document.getElementById('labRemarks').value = '';
            document.getElementById('testStatus').value = 'Normal';

            renderLabTechView(container);
        });
    }

    if (sendBackBtn) {
        sendBackBtn.addEventListener('click', function () {
            if (!selectedPatient) return;

            const tests = selectedPatient.labTests || [];

            if (tests.length === 0) {
                showNotification('Please add at least one test before sending to doctor', 'error');
                return;
            }

            const labResultsHTML = tests.map(test => `
                <div style="margin-bottom: 0.5rem; padding: 0.5rem; background: var(--bg-secondary); border-radius: 4px; border-left: 3px solid ${getStatusColor(test.status)};">
                    <strong>${test.type}</strong> - <span style="color: ${getStatusColor(test.status)};">${test.status}</span><br>
                    <span style="font-size: 0.85rem;">${test.results.replace(/\n/g, '<br>')}</span>
                    ${test.remarks ? `<br><em style="font-size: 0.8rem; color: var(--text-muted);">Remarks: ${test.remarks}</em>` : ''}
                </div>
            `).join('');

            movePatient(QUEUE_KEYS.lab, QUEUE_KEYS.doctor, selectedPatient.id, {
                action: 'Lab Results Ready',
                labResults: labResultsHTML,
                labTestsCount: tests.length,
                notes: `${tests.length} test(s) completed: ${tests.map(t => t.type).join(', ')}`
            });

            showNotification(`${tests.length} test result(s) sent to Doctor`, 'success');
            selectedPatient = null;
            renderLabTechView(container);
        });
    }
}

// ==========================================
// ADMIN VIEW
// ==========================================
function renderAdminView(container) {
    const doctorQueue = getQueue(QUEUE_KEYS.doctor);
    const labQueue = getQueue(QUEUE_KEYS.lab);
    const billingQueue = getQueue(QUEUE_KEYS.billing);
    const ipdQueue = getQueue(QUEUE_KEYS.ipd);
    const completedQueue = getQueue(QUEUE_KEYS.completed);
    const allPatients = getAllPatients();
    const config = getHospitalConfig();
    const workflows = getCustomWorkflows();
    const allRoles = Object.keys(workflows).filter(r => r !== 'admin');

    // Count today's patients
    const today = new Date().toDateString();
    const todayPatients = allPatients.filter(p => {
        return new Date(p.registeredAt).toDateString() === today;
    });

    container.innerHTML = `
        <!-- Hospital Settings -->
        <div class="card" style="margin-bottom: var(--spacing-lg);">
            <div class="card-header">
                <h3 class="card-title">🏥 Hospital Settings</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: var(--spacing-xs);">
                    Configure your hospital name and basic settings
                </p>
            </div>
            <div class="card-body">
                <div class="form-group">
                    <label class="form-label">Hospital Name</label>
                    <div style="display: flex; gap: var(--spacing-sm); align-items: center;">
                        <input type="text" 
                               id="hospitalNameInput" 
                               class="form-input" 
                               value="${config.name || 'My Hospital'}"
                               placeholder="Enter hospital name"
                               style="flex: 1;">
                        <button class="btn btn-primary" onclick="updateHospitalName()">
                            💾 Save Name
                        </button>
                    </div>
                    <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: var(--spacing-xs);">
                        This name will be displayed in the header across all pages.
                    </p>
                </div>
            </div>
        </div>
        
        <!-- Summary Stats -->
        <div class="stats-summary">
            <div class="summary-card">
                <div class="summary-icon">📋</div>
                <div class="summary-value">${todayPatients.length}</div>
                <div class="summary-label">Today's Registrations</div>
            </div>
            <div class="summary-card">
                <div class="summary-icon">🩺</div>
                <div class="summary-value">${doctorQueue.length}</div>
                <div class="summary-label">OPD Queue</div>
            </div>
            <div class="summary-card">
                <div class="summary-icon">🛏️</div>
                <div class="summary-value">${ipdQueue.length}</div>
                <div class="summary-label">Admitted (IPD)</div>
            </div>
            <div class="summary-card">
                <div class="summary-icon">🔬</div>
                <div class="summary-value">${labQueue.length}</div>
                <div class="summary-label">In Lab</div>
            </div>
            <div class="summary-card">
                <div class="summary-icon">💰</div>
                <div class="summary-value">${billingQueue.length}</div>
                <div class="summary-label">Pending Billing</div>
            </div>
            <div class="summary-card">
                <div class="summary-icon">✅</div>
                <div class="summary-value">${completedQueue.length}</div>
                <div class="summary-label">Completed</div>
            </div>
        </div>
        
        <!-- Search Access Configuration -->
        <div class="card" style="margin-bottom: var(--spacing-lg);">
            <div class="card-header">
                <h3 class="card-title">🔍 Patient Search Access Configuration</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: var(--spacing-xs);">
                    Configure which roles can search for patients by Patient ID
                </p>
            </div>
            <div class="card-body">
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--spacing-md);">
                    ${allRoles.map(roleId => {
        const wf = workflows[roleId];
        const hasAccess = (config.searchAccess || []).includes(roleId);
        return `
                            <label style="display: flex; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-md); background: var(--bg-secondary); border-radius: var(--radius-md); cursor: pointer; border: 2px solid ${hasAccess ? 'var(--primary-color)' : 'transparent'};">
                                <input type="checkbox" 
                                       ${hasAccess ? 'checked' : ''} 
                                       onchange="toggleSearchAccess('${roleId}', this.checked)"
                                       style="width: 20px; height: 20px; cursor: pointer;">
                                <div>
                                    <div style="font-weight: 500;">${wf.icon} ${wf.name}</div>
                                    <div style="font-size: 0.85rem; color: var(--text-muted);">${wf.description || 'Custom role'}</div>
                                </div>
                            </label>
                        `;
    }).join('')}
                </div>
                <div style="margin-top: var(--spacing-md); padding-top: var(--spacing-md); border-top: 1px solid var(--border-color);">
                    <p style="color: var(--text-muted); font-size: 0.9rem;">
                        <strong>Note:</strong> Roles with search access can search for any patient by Patient ID and view their complete history across all queues.
                    </p>
                </div>
            </div>
        </div>
        
        <!-- Queue Overview -->
        <div class="card-grid">
            <div class="queue-panel">
                <div class="queue-title">
                    🩺 OPD Queue
                    <span class="queue-count">${doctorQueue.length}</span>
                </div>
                ${renderQueueList(doctorQueue.slice(0, 5), false)}
            </div>
            
            <div class="queue-panel">
                <div class="queue-title">
                    🛏️ Admitted (IPD)
                    <span class="queue-count">${ipdQueue.length}</span>
                </div>
                ${ipdQueue.length === 0 ? '<div class="queue-empty"><div class="queue-empty-icon">🛏️</div><p>No admitted patients</p></div>' :
            ipdQueue.map(p => `
                    <div class="patient-card no-click" style="cursor: default;">
                        <div class="patient-card-header">
                            <span class="patient-name">${p.name}</span>
                            <span class="patient-token" style="background: var(--info-color);">🛏️ ${p.bedNumber}</span>
                        </div>
                        <div class="patient-info">${p.wardType} • ${p.diagnosis || p.complaint}</div>
                    </div>
                  `).join('')}
            </div>
            
            <div class="queue-panel">
                <div class="queue-title">
                    🔬 Lab Queue
                    <span class="queue-count">${labQueue.length}</span>
                </div>
                ${renderQueueList(labQueue.slice(0, 5), false)}
            </div>
            
            <div class="queue-panel">
                <div class="queue-title">
                    💰 Pending Billing
                    <span class="queue-count">${billingQueue.length}</span>
                </div>
                ${billingQueue.length === 0 ? '<div class="queue-empty"><div class="queue-empty-icon">✅</div><p>No pending bills</p></div>' :
            billingQueue.map(p => `
                    <div class="patient-card no-click" style="cursor: default;">
                        <div class="patient-card-header">
                            <span class="patient-name">${p.name}</span>
                            <span class="patient-token" style="background: ${p.billType === 'admission' ? 'var(--info-color)' : 'var(--accent-color)'};">
                                ${p.billType === 'admission' ? '🛏️ Admit' : '📤 Discharge'}
                            </span>
                        </div>
                        <div class="patient-info">${p.wardType || 'OPD'} • ${p.diagnosis || p.complaint}</div>
                    </div>
                  `).join('')}
            </div>
            
            <div class="queue-panel">
                <div class="queue-title">
                    ✅ Recently Completed
                    <span class="queue-count">${completedQueue.length}</span>
                </div>
                ${renderQueueList(completedQueue.slice(-5), false)}
            </div>
        </div>
    `;
}

// Update hospital name
function updateHospitalName() {
    const nameInput = document.getElementById('hospitalNameInput');
    if (!nameInput) return;

    const newName = nameInput.value.trim();
    if (!newName) {
        showNotification('Please enter a hospital name', 'error');
        return;
    }

    const config = getHospitalConfig();
    config.name = newName;
    saveHospitalConfig(config);

    // Update header logo text
    updateHospitalNameInHeader(newName);

    showNotification('Hospital name updated successfully!', 'success');

    // Re-render admin view to show updated name
    setTimeout(() => {
        renderActivityContent();
    }, 300);
}

// Update hospital name in header
function updateHospitalNameInHeader(name) {
    const logoText = document.querySelector('.logo-text');
    if (logoText) {
        logoText.textContent = name || 'Hospital LCNC';
    }

    // Also update page title
    const currentTitle = document.title;
    const parts = currentTitle.split(' - ');
    if (parts.length > 1) {
        document.title = `${parts[0]} - ${name}`;
    } else {
        document.title = `${name} - ${parts[0]}`;
    }
}

// Toggle search access for a role
function toggleSearchAccess(roleId, enabled) {
    const config = getHospitalConfig();
    if (!config.searchAccess) {
        config.searchAccess = [];
    }

    if (enabled) {
        if (!config.searchAccess.includes(roleId)) {
            config.searchAccess.push(roleId);
        }
    } else {
        config.searchAccess = config.searchAccess.filter(r => r !== roleId);
    }

    saveHospitalConfig(config);
    showNotification(`${enabled ? 'Enabled' : 'Disabled'} search access for ${getCustomWorkflows()[roleId]?.name || roleId}`, 'success');

    // Re-render admin view to show updated state
    setTimeout(() => {
        renderActivityContent();
    }, 300);
}

// ==========================================
// BILLING VIEW
// ==========================================
function renderBillingView(container) {
    const billingQueue = getQueue(QUEUE_KEYS.billing);
    const ipdQueue = getQueue(QUEUE_KEYS.ipd);

    // Check if search results are being displayed - if so, don't replace
    const searchResults = document.getElementById('patientSearchResults');
    if (searchResults && searchResults.innerHTML.trim() !== '') {
        return; // Keep search results visible
    }

    // Check if search bar exists - if so, only replace content after it
    const searchBar = container.querySelector('.card:first-child');
    const searchResultsDiv = container.querySelector('#patientSearchResults');
    const searchBarHTML = searchBar && searchBar.querySelector('#patientSearchInput') ? searchBar.outerHTML : '';
    const searchResultsHTML = searchResultsDiv ? searchResultsDiv.outerHTML : '<div id="patientSearchResults"></div>';

    // Remove existing billing view if present (to avoid duplicates)
    const existingView = container.querySelector('.activity-layout');
    if (existingView) {
        existingView.remove();
    }

    // Separate admissions and discharges
    const admissions = billingQueue.filter(p => p.billType === 'admission');
    const discharges = billingQueue.filter(p => p.billType === 'discharge');

    container.innerHTML = searchBarHTML + searchResultsHTML + `
        <div class="activity-layout">
            <!-- Work Area -->
            <div class="work-area" id="billingWorkArea">
                ${selectedPatient ? renderBillingPatientView(selectedPatient) : renderNoSelection('Select a patient from the pending queue to process')}
            </div>
            
            <!-- Pending Queue -->
            <div class="queue-panel">
                <div class="queue-title">
                    📋 Pending Approvals
                    <span class="queue-count">${billingQueue.length}</span>
                </div>
                
                ${admissions.length > 0 ? `
                    <div style="margin-bottom: var(--spacing-md);">
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: var(--spacing-xs);">🛏️ ADMISSIONS (${admissions.length})</div>
                        ${renderBillingQueueList(admissions)}
                    </div>
                ` : ''}
                
                ${discharges.length > 0 ? `
                    <div>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: var(--spacing-xs);">📤 DISCHARGES (${discharges.length})</div>
                        ${renderBillingQueueList(discharges)}
                    </div>
                ` : ''}
                
                ${billingQueue.length === 0 ? `
                    <div class="queue-empty">
                        <div class="queue-empty-icon">✅</div>
                        <p>No pending approvals</p>
                    </div>
                ` : ''}
                
                <!-- IPD Overview -->
                <div style="margin-top: var(--spacing-lg); padding-top: var(--spacing-lg); border-top: 1px solid var(--border-color);">
                    <div class="queue-title">
                        🛏️ Current IPD
                        <span class="queue-count">${ipdQueue.length}</span>
                    </div>
                    ${ipdQueue.length === 0 ? '<p style="color: var(--text-muted); font-size: 0.85rem;">No admitted patients</p>' :
            ipdQueue.slice(0, 3).map(p => `
                        <div style="padding: 0.5rem; background: var(--bg-secondary); border-radius: 4px; margin-bottom: 0.25rem; font-size: 0.85rem;">
                            <strong>${p.name}</strong> - Bed ${p.bedNumber || 'TBD'}
                        </div>
                      `).join('') + (ipdQueue.length > 3 ? `<p style="font-size: 0.75rem; color: var(--text-muted);">+ ${ipdQueue.length - 3} more</p>` : '')}
                </div>
            </div>
        </div>
    `;

    // Add click handlers for patient cards
    document.querySelectorAll('.patient-card').forEach(card => {
        card.addEventListener('click', function () {
            const patientId = this.dataset.patientId;
            selectedPatient = billingQueue.find(p => p.id === patientId);
            renderBillingView(container);
        });
    });

    // Handle billing actions
    setupBillingActions(container);

    // Attach search event listeners if search bar exists
    if (hasSearchAccess()) {
        setTimeout(() => attachSearchEventListeners(), 0);
    }
}

function renderBillingQueueList(queue) {
    return queue.map(patient => `
        <div class="patient-card ${selectedPatient && selectedPatient.id === patient.id ? 'selected' : ''}" 
             data-patient-id="${patient.id}">
            <div class="patient-card-header">
                <span class="patient-name">${patient.name}</span>
                <span class="patient-token" style="background: ${patient.billType === 'admission' ? 'var(--info-color)' : 'var(--accent-color)'};">
                    ${patient.billType === 'admission' ? '🛏️' : '📤'} ${patient.bedNumber || '#' + patient.token}
                </span>
            </div>
            <div class="patient-info">${patient.wardType || ''} • ${patient.diagnosis || patient.complaint}</div>
            <div class="patient-time">⏱️ ${formatTime(patient.admissionRequestedAt || patient.dischargeInitiatedAt || patient.registeredAt)}</div>
        </div>
    `).join('');
}

function renderBillingPatientView(patient) {
    const isAdmission = patient.billType === 'admission';

    return `
        <div class="work-area-header">
            <h2 class="work-area-title">${isAdmission ? '🛏️ Admission Approval' : '📤 Discharge Billing'}</h2>
            <span class="status-badge waiting">${isAdmission ? '🟡 Pending Admission' : '🟠 Pending Discharge'}</span>
        </div>
        
        <div class="patient-details">
            <div class="patient-details-header">
                <div class="patient-avatar">${isAdmission ? '🛏️' : '📤'}</div>
                <div class="patient-primary-info">
                    <h3>${patient.name}</h3>
                    <p>Token #${patient.token} • ${patient.age} years • ${patient.gender}</p>
                </div>
            </div>
            
            <div class="patient-details-grid">
                <div class="detail-item">
                    <div class="detail-label">Phone</div>
                    <div class="detail-value">${patient.phone}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Diagnosis</div>
                    <div class="detail-value">${patient.diagnosis || 'N/A'}</div>
                </div>
                ${isAdmission ? `
                    <div class="detail-item">
                        <div class="detail-label">Ward Type</div>
                        <div class="detail-value">${patient.wardType}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Bed Number</div>
                        <div class="detail-value">${patient.bedNumber}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Admission Notes</div>
                        <div class="detail-value">${patient.admissionNotes || 'N/A'}</div>
                    </div>
                ` : `
                    <div class="detail-item">
                        <div class="detail-label">Admitted At</div>
                        <div class="detail-value">${formatTime(patient.admittedAt)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Bed Number</div>
                        <div class="detail-value">${patient.bedNumber}</div>
                    </div>
                `}
            </div>
            
            ${!isAdmission && patient.dischargeSummary ? `
                <div style="margin-top: var(--spacing-md); padding: var(--spacing-md); background: var(--bg-card); border-radius: var(--radius-md);">
                    <strong>Discharge Summary:</strong><br>
                    <pre style="font-family: inherit; white-space: pre-wrap; margin-top: 0.5rem; color: var(--text-secondary);">${patient.dischargeSummary}</pre>
                </div>
            ` : ''}
        </div>
        
        <!-- Billing Form -->
        <form id="billingForm" style="margin-top: var(--spacing-lg);">
            <h4 style="margin-bottom: var(--spacing-md);">💰 Billing Details</h4>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-md);">
                ${isAdmission ? `
                    <div class="form-group">
                        <label class="form-label">Admission Deposit (₹)</label>
                        <input type="number" class="form-input" id="billAmount" value="${getWardDeposit(patient.wardType)}" placeholder="Enter amount">
                    </div>
                ` : `
                    <div class="form-group">
                        <label class="form-label">Total Bill Amount (₹)</label>
                        <input type="number" class="form-input" id="billAmount" value="5000" placeholder="Enter total bill">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Deposit Paid (₹)</label>
                        <input type="number" class="form-input" id="depositPaid" value="${patient.depositAmount || 0}" readonly>
                    </div>
                `}
            </div>
            
            <div class="form-group">
                <label class="form-label">Billing Notes</label>
                <input type="text" class="form-input" id="billingNotes" placeholder="Any notes for billing">
            </div>
            
            <div class="action-buttons">
                ${isAdmission ? `
                    <button type="button" class="btn btn-success" id="approveAdmission">
                        ✓ Approve & Admit Patient
                    </button>
                    <button type="button" class="btn btn-danger" id="rejectAdmission">
                        ✕ Reject Admission
                    </button>
                ` : `
                    <button type="button" class="btn btn-success" id="approveDischarge">
                        ✓ Bill Paid - Complete Discharge
                    </button>
                `}
            </div>
        </form>
        
        <!-- History -->
        ${renderPatientHistory(patient)}
    `;
}

function getWardDeposit(wardType) {
    const deposits = {
        'General': 5000,
        'Semi-Private': 10000,
        'Private': 20000,
        'ICU': 50000,
        'Emergency': 10000
    };
    return deposits[wardType] || 5000;
}

function setupBillingActions(container) {
    const approveAdmissionBtn = document.getElementById('approveAdmission');
    const rejectAdmissionBtn = document.getElementById('rejectAdmission');
    const approveDischargeBtn = document.getElementById('approveDischarge');

    if (approveAdmissionBtn) {
        approveAdmissionBtn.addEventListener('click', function () {
            const billAmount = document.getElementById('billAmount').value;
            const billingNotes = document.getElementById('billingNotes').value;

            movePatient(QUEUE_KEYS.billing, QUEUE_KEYS.ipd, selectedPatient.id, {
                action: 'Admission Approved',
                depositAmount: billAmount,
                billingNotes: billingNotes,
                admittedAt: new Date().toISOString(),
                status: 'admitted',
                notes: `Admitted to ${selectedPatient.wardType} - Bed ${selectedPatient.bedNumber}. Deposit: ₹${billAmount}`
            });

            showNotification(`Patient admitted to Bed ${selectedPatient.bedNumber}!`, 'success');
            selectedPatient = null;
            renderBillingView(container);
        });
    }

    if (rejectAdmissionBtn) {
        rejectAdmissionBtn.addEventListener('click', function () {
            if (confirm('Reject this admission? Patient will be sent back to doctor.')) {
                movePatient(QUEUE_KEYS.billing, QUEUE_KEYS.doctor, selectedPatient.id, {
                    action: 'Admission Rejected',
                    billType: null,
                    notes: 'Admission rejected by billing'
                });

                showNotification('Admission rejected. Patient returned to doctor.', 'info');
                selectedPatient = null;
                renderBillingView(container);
            }
        });
    }

    if (approveDischargeBtn) {
        approveDischargeBtn.addEventListener('click', function () {
            const billAmount = document.getElementById('billAmount').value;
            const billingNotes = document.getElementById('billingNotes').value;

            movePatient(QUEUE_KEYS.billing, QUEUE_KEYS.completed, selectedPatient.id, {
                action: 'Discharged',
                finalBillAmount: billAmount,
                billingNotes: billingNotes,
                dischargedAt: new Date().toISOString(),
                status: 'discharged',
                patientType: 'IPD',
                notes: `Discharged. Final bill: ₹${billAmount}`
            });

            showNotification(`Patient discharged successfully!`, 'success');
            selectedPatient = null;
            renderBillingView(container);
        });
    }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================
function renderQueueList(queue, selectable) {
    if (queue.length === 0) {
        return `
            <div class="queue-empty">
                <div class="queue-empty-icon">📭</div>
                <p>No patients in queue</p>
            </div>
        `;
    }

    return queue.map(patient => `
        <div class="patient-card ${selectable ? '' : 'no-click'} ${selectedPatient && selectedPatient.id === patient.id ? 'selected' : ''}" 
             data-patient-id="${patient.id}" ${!selectable ? 'style="cursor: default;"' : ''}>
            <div class="patient-card-header">
                <span class="patient-name">${patient.name}</span>
                <span class="patient-token">#${patient.token}</span>
            </div>
            <div class="patient-info">${patient.age}y, ${patient.gender} • ${patient.complaint.substring(0, 30)}${patient.complaint.length > 30 ? '...' : ''}</div>
            <div class="patient-time">⏱️ ${formatTime(patient.registeredAt)}</div>
        </div>
    `).join('');
}

function renderNoSelection(message) {
    return `
        <div class="no-selection">
            <div class="no-selection-icon">👆</div>
            <h3>No Patient Selected</h3>
            <p>${message}</p>
        </div>
    `;
}

function renderPatientHistory(patient) {
    if (!patient.history || patient.history.length === 0) {
        return '';
    }

    return `
        <div class="history-section">
            <h4 class="history-title">📜 Patient Journey</h4>
            ${patient.history.map(h => `
                <div class="history-item">
                    <div class="history-icon">📝</div>
                    <div class="history-content">
                        <div class="history-action">${h.action}</div>
                        <div class="history-by">by ${h.by} • ${formatTime(h.time)}</div>
                        ${h.notes ? `<div class="history-notes">${h.notes}</div>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}
