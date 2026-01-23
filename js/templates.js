/**
 * TEMPLATES PAGE - LCNC Workflow Template Management
 * ===================================================
 * This is the core LCNC concept - Pre-built templates that 
 * hospitals can use without writing code.
 * 
 * Admin can:
 * - View available workflow templates
 * - Enable/disable roles
 * - See the workflow flow
 * - Customize as needed
 * 
 * Note: WORKFLOW_TEMPLATES, DEFAULT_FORM_FIELDS, FIELD_TYPES, and 
 * DEFAULT_HOSPITAL_CONFIG are defined in common.js to avoid duplication
 */

// Current form tab
let currentFormTab = 'receptionist';

// Initialization is at the end of this file to ensure all functions are defined first

// Load hospital configuration
function loadHospitalConfig() {
    const saved = loadFromStorage('hospitalConfig', null);
    if (!saved) {
        saveToStorage('hospitalConfig', DEFAULT_HOSPITAL_CONFIG);
    }
}

// Note: getHospitalConfig() and saveHospitalConfig() are defined in common.js

// Current editing state
let editingTemplate = null;

// Render the templates page
function renderTemplatesPage() {
    const container = document.getElementById('templatesContent');
    if (!container) {
        console.error('templatesContent container not found');
        return;
    }

    try {
        const config = getHospitalConfig();

        // Ensure config has required properties
        if (!config || !config.enabledWorkflows) {
            config.enabledWorkflows = DEFAULT_HOSPITAL_CONFIG.enabledWorkflows;
            saveHospitalConfig(config);
        }

        // If editing a template, show the Form Builder
        if (editingTemplate) {
            container.innerHTML = renderFormBuilderPage(editingTemplate);
            return;
        }

        // Otherwise show the main templates view
        container.innerHTML = `
        <!-- Workflow Designer Section -->
        <div class="card" style="margin-bottom: var(--spacing-xl);">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 class="card-title">🔗 Workflow Designer</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: var(--spacing-xs);">
                        Visual patient flow - See who can forward patients to whom
                    </p>
                </div>
                <div style="display: flex; gap: var(--spacing-sm);">
                    <button class="btn btn-primary" onclick="openWorkflowDesigner()">
                        ✏️ Edit Flow
                    </button>
                    <button class="btn btn-secondary" onclick="openCreateWorkflow()">
                        ➕ New Role
                    </button>
                </div>
            </div>
            <div class="card-body">
                ${renderInteractiveWorkflow(config)}
            </div>
        </div>
        
        <!-- Available Templates -->
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">🧩 Workflow Templates</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: var(--spacing-xs);">
                    Click "Edit" to customize forms for each role
                </p>
            </div>
            <div class="card-body">
                <div class="templates-grid">
                    ${(() => {
                const workflows = getCustomWorkflows();
                const workflowArray = Object.values(workflows);
                if (workflowArray.length === 0) {
                    return '<p style="color: var(--text-muted); text-align: center; padding: var(--spacing-xl);">No workflow templates found. Please refresh the page.</p>';
                }
                return workflowArray.map(template => renderTemplateCard(template, config)).join('');
            })()}
                </div>
            </div>
        </div>
        
        <!-- Deleted Workflows (Restore Section) -->
        ${(() => {
                const deletedWorkflows = getDeletedWorkflows();
                if (deletedWorkflows.length === 0) return '';

                return `
            <div class="card" style="margin-top: var(--spacing-lg); border-left: 4px solid var(--danger-color);">
                <div class="card-header">
                    <h3 class="card-title">🗑️ Deleted Workflows</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: var(--spacing-xs);">
                        Default workflows that were deleted. You can restore them here.
                    </p>
                </div>
                <div class="card-body">
                    <div class="templates-grid">
                        ${deletedWorkflows.map(template => `
                            <div class="template-card disabled" style="
                                background: var(--bg-card);
                                border-radius: var(--radius-lg);
                                padding: var(--spacing-lg);
                                border-left: 4px solid ${template.color};
                                opacity: 0.6;
                                position: relative;
                            ">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--spacing-md);">
                                    <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                                        <span style="font-size: 2rem;">${template.icon}</span>
                                        <div>
                                            <h4 style="margin: 0; color: ${template.color};">
                                                ${template.name} <span style="font-size: 0.7rem; color: var(--danger-color);">(Deleted)</span>
                                            </h4>
                                            <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted);">${template.description}</p>
                                        </div>
                                    </div>
                                    <button class="btn btn-primary btn-small" onclick="restoreWorkflow('${template.id}')" 
                                            style="padding: 4px 12px; font-size: 0.75rem;">
                                        ♻️ Restore
                                    </button>
                                </div>
                                <div style="margin-bottom: var(--spacing-md);">
                                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: var(--spacing-xs);">FEATURES:</div>
                                    <ul style="margin: 0; padding-left: var(--spacing-lg); font-size: 0.85rem; color: var(--text-secondary);">
                                        ${(template.features || []).map(f => `<li>${f}</li>`).join('')}
                                    </ul>
                                </div>
                                <div style="
                                    background: var(--bg-secondary);
                                    padding: var(--spacing-sm) var(--spacing-md);
                                    border-radius: var(--radius-md);
                                    font-size: 0.8rem;
                                    color: var(--text-muted);
                                ">
                                    <span><strong>Flow:</strong> ${template.workflow}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            `;
            })()}
        
        <!-- Quick Stats -->
        <div class="stats-summary" style="margin-top: var(--spacing-xl);">
            <div class="summary-card">
                <div class="summary-icon">🧩</div>
                <div class="summary-value">${config.enabledWorkflows.length}</div>
                <div class="summary-label">Active Workflows</div>
            </div>
            <div class="summary-card">
                <div class="summary-icon">👥</div>
                <div class="summary-value">${config.enabledWorkflows.filter(w => w !== 'admin').length}</div>
                <div class="summary-label">User Roles</div>
            </div>
            <div class="summary-card">
                <div class="summary-icon">✅</div>
                <div class="summary-value">Ready</div>
                <div class="summary-label">System Status</div>
            </div>
        </div>
    `;

        // Add toggle event listeners
        document.querySelectorAll('.template-toggle').forEach(toggle => {
            toggle.addEventListener('change', function () {
                toggleWorkflow(this.dataset.templateId, this.checked);
            });
        });

        // Update SVG connections after DOM is ready (for n8n-style workflow)
        setTimeout(() => {
            updateWorkflowConnections();
        }, 100);
    } catch (error) {
        console.error('Error rendering templates page:', error);
        container.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <p style="color: var(--danger-color);">Error loading templates. Please refresh the page.</p>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">${error.message}</p>
                </div>
            </div>
        `;
    }
}

// Note: getCustomWorkflows() is defined in common.js

// Note: DEFAULT_WORKFLOW_CONNECTIONS, getWorkflowConnections(), and saveWorkflowConnections() 
// are defined in common.js to avoid duplication

// Render interactive workflow diagram with connections (n8n-style)
function renderInteractiveWorkflow(config) {
    const workflows = getCustomWorkflows();
    const connections = getWorkflowConnections();
    const enabledWorkflows = (config.enabledWorkflows || []).filter(id => id !== 'admin');

    // Build connection map for visualization
    const connectionMap = {};
    const allConnections = [];
    enabledWorkflows.forEach(id => {
        const targets = (connections[id] || []).filter(tId => enabledWorkflows.includes(tId) && tId !== 'completed');
        if (targets.length > 0) {
            connectionMap[id] = targets;
            targets.forEach(targetId => {
                allConnections.push({ from: id, to: targetId });
            });
        }
    });

    // Calculate node positions (hierarchical layout)
    const { positions: nodePositions, levels: nodeLevels } = calculateNodePositions(enabledWorkflows, connectionMap);
    const canvasId = 'workflow-canvas-' + Date.now();

    // Calculate canvas dimensions
    const maxX = Math.max(...Object.values(nodePositions).map(p => p.x), 0) + 200;
    const maxY = Math.max(...Object.values(nodePositions).map(p => p.y), 0) + 150;

    // Store levels in JSON format for data attribute
    const levelsJson = JSON.stringify(nodeLevels);

    return `
        <div class="workflow-canvas" id="${canvasId}" data-node-levels='${levelsJson}' style="
            background: var(--bg-secondary);
            border-radius: var(--radius-lg);
            padding: var(--spacing-xl);
            min-height: ${Math.max(400, maxY + 100)}px;
            position: relative;
            overflow: auto;
        ">
            <!-- Legend -->
            <div style="position: absolute; top: var(--spacing-md); right: var(--spacing-md); font-size: 0.75rem; color: var(--text-muted); z-index: 10; background: var(--bg-secondary); padding: 4px 8px; border-radius: 4px;">
                Click "Edit Flow" to configure connections
            </div>
            
            <!-- SVG for connection lines -->
            <svg class="workflow-connections" style="
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 1;
            " id="svg-${canvasId}">
                ${allConnections.map((conn, idx) => {
        const fromPos = nodePositions[conn.from];
        const toPos = nodePositions[conn.to];
        if (!fromPos || !toPos) return '';

        // Node dimensions
        const nodeWidth = 140;
        const nodeHeight = 100;

        // Check if this is a back-connection (target is at an earlier level than source)
        // Only connections going backwards in the hierarchy are back-connections
        const fromLevel = nodeLevels[conn.from] ?? 999;
        const toLevel = nodeLevels[conn.to] ?? 999;
        // Back-connection only if target level is strictly less than source level
        const isBackConnection = (toLevel < fromLevel) && (toLevel !== 999 && fromLevel !== 999);

        // Calculate connection points
        let x1, y1, x2, y2;

        // Connection points are 6px from the edge (connection point radius)
        const connectionPointOffset = 6;

        if (isBackConnection) {
            // Back-connection: from right connection point to left connection point
            x1 = fromPos.x + nodeWidth + connectionPointOffset;
            y1 = fromPos.y + (nodeHeight / 2);
            x2 = toPos.x - connectionPointOffset;
            y2 = toPos.y + (nodeHeight / 2);

            // Create a more pronounced curve for back-connections
            const midX = (x1 + x2) / 2;
            const curveOffset = Math.abs(x1 - x2) * 0.3; // 30% offset for curve
            const path = `M ${x1} ${y1} C ${midX + curveOffset} ${y1 - curveOffset}, ${midX + curveOffset} ${y2 - curveOffset}, ${x2} ${y2}`;

            // Use source node's color for the connection line
            const connectionColor = workflows[conn.from]?.color || '#667eea';

            return `
                            <path d="${path}" 
                                  stroke="${connectionColor}" 
                                  stroke-width="2.5" 
                                  fill="none" 
                                  stroke-dasharray="5,5"
                                  marker-end="url(#arrowhead-${canvasId}-${idx})"
                                  opacity="0.8" />
                        `;
        } else {
            // Forward connection: right connection point to left connection point
            x1 = fromPos.x + nodeWidth + connectionPointOffset;
            y1 = fromPos.y + (nodeHeight / 2);
            x2 = toPos.x - connectionPointOffset;
            y2 = toPos.y + (nodeHeight / 2);

            // Create smooth curved path
            const controlX = (x1 + x2) / 2;
            const path = `M ${x1} ${y1} C ${controlX} ${y1}, ${controlX} ${y2}, ${x2} ${y2}`;

            // Use source node's color for the connection line
            const connectionColor = workflows[conn.from]?.color || '#667eea';

            return `
                            <path d="${path}" 
                                  stroke="${connectionColor}" 
                                  stroke-width="2.5" 
                                  fill="none" 
                                  marker-end="url(#arrowhead-${canvasId}-${idx})"
                                  opacity="0.7" />
                        `;
        }
    }).join('')}
                <defs>
                    ${allConnections.map((conn, idx) => {
        // Use source node's color for the arrowhead
        const connectionColor = workflows[conn.from]?.color || '#667eea';
        return `
                            <marker id="arrowhead-${canvasId}-${idx}" 
                                    markerWidth="10" 
                                    markerHeight="10" 
                                    refX="9" 
                                    refY="3" 
                                    orient="auto"
                                    markerUnits="strokeWidth">
                                <polygon points="0 0, 10 3, 0 6" 
                                         fill="${connectionColor}" 
                                         opacity="0.8" />
                            </marker>
                        `;
    }).join('')}
                </defs>
            </svg>
            
            <!-- Workflow Nodes (n8n-style) -->
            <div class="workflow-nodes-container" style="
                position: relative;
                z-index: 2;
                width: ${maxX}px;
                height: ${maxY}px;
                min-height: 300px;
            ">
                ${enabledWorkflows.map(id => {
        const wf = workflows[id] || WORKFLOW_TEMPLATES[id];
        if (!wf) return '';
        const pos = nodePositions[id] || { x: 0, y: 0 };
        const targets = connectionMap[id] || [];

        return `
                        <div class="workflow-node-n8n" 
                             data-workflow-id="${id}" 
                             style="
                                position: absolute;
                                left: ${pos.x}px;
                                top: ${pos.y}px;
                                background: var(--bg-card);
                                border: 2px solid ${wf.color};
                                border-radius: 8px;
                                padding: 12px 16px;
                                width: 140px;
                                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                                cursor: pointer;
                                transition: transform 0.2s, box-shadow 0.2s;
                            "
                            onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)'"
                            onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.2)'"
                        >
                            <!-- Connection point (right) -->
                            <div class="connection-point-right" style="
                                position: absolute;
                                right: -6px;
                                top: 50%;
                                transform: translateY(-50%);
                                width: 12px;
                                height: 12px;
                                background: ${wf.color};
                                border: 2px solid var(--bg-card);
                                border-radius: 50%;
                                z-index: 3;
                            "></div>
                            
                            <!-- Connection point (left) -->
                            <div class="connection-point-left" style="
                                position: absolute;
                                left: -6px;
                                top: 50%;
                                transform: translateY(-50%);
                                width: 12px;
                                height: 12px;
                                background: ${wf.color};
                                border: 2px solid var(--bg-card);
                                border-radius: 50%;
                                z-index: 3;
                            "></div>
                            
                            <!-- Node content -->
                            <div style="text-align: center;">
                                <div style="font-size: 1.8rem; margin-bottom: 6px; line-height: 1;">${wf.icon}</div>
                                <div style="font-weight: 600; color: ${wf.color}; font-size: 0.9rem; margin-bottom: 6px; line-height: 1.2;">${wf.name}</div>
                                ${targets.length > 0 ? `
                                    <div style="
                                        font-size: 0.65rem;
                                        color: var(--text-muted);
                                        background: ${wf.color}15;
                                        padding: 2px 6px;
                                        border-radius: 4px;
                                        display: inline-block;
                                        line-height: 1.2;
                                    ">
                                        ${targets.length} connection${targets.length > 1 ? 's' : ''}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
    }).join('')}
            </div>
            
            <!-- Connection Summary -->
            ${allConnections.length > 0 ? `
            <div style="margin-top: var(--spacing-lg); padding-top: var(--spacing-lg); border-top: 1px solid var(--border-color); position: relative; z-index: 2;">
                <h4 style="margin-bottom: var(--spacing-md); color: var(--text-secondary);">🔗 Active Connections (Bidirectional Supported):</h4>
                <div style="display: flex; flex-wrap: wrap; gap: var(--spacing-md);">
                    ${enabledWorkflows.map(id => {
        const wf = workflows[id] || WORKFLOW_TEMPLATES[id];
        if (!wf) return '';
        const targets = connectionMap[id] || [];
        if (targets.length === 0) return '';

        // Check for bidirectional connections
        const bidirectional = targets.filter(tId => {
            const reverseTargets = connectionMap[tId] || [];
            return reverseTargets.includes(id);
        });

        return `
                            <div style="
                                background: var(--bg-card);
                                padding: var(--spacing-sm) var(--spacing-md);
                                border-radius: var(--radius-md);
                                border-left: 3px solid ${wf.color};
                            ">
                                <div style="font-size: 0.85rem; font-weight: 600; color: ${wf.color}; margin-bottom: var(--spacing-xs);">
                                    ${wf.icon} ${wf.name}
                                </div>
                                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">
                                    → ${targets.map(tId => {
            const targetWf = workflows[tId] || WORKFLOW_TEMPLATES[tId];
            const isBidirectional = bidirectional.includes(tId);
            return targetWf ? `${targetWf.icon} ${targetWf.name}${isBidirectional ? ' ↕️' : ''}` : tId;
        }).join(', ')}
                                </div>
                                ${bidirectional.length > 0 ? `
                                    <div style="font-size: 0.7rem; color: var(--secondary-color); font-style: italic;">
                                        ↕️ Bidirectional with: ${bidirectional.map(tId => {
            const targetWf = workflows[tId] || WORKFLOW_TEMPLATES[tId];
            return targetWf ? targetWf.name : tId;
        }).join(', ')}
                                    </div>
                                ` : ''}
                            </div>
                        `;
    }).filter(html => html !== '').join('')}
                </div>
            </div>
            ` : `
            <div style="margin-top: var(--spacing-lg); padding-top: var(--spacing-lg); border-top: 1px solid var(--border-color); position: relative; z-index: 2;">
                <div style="color: var(--text-muted); font-size: 0.85rem; padding: var(--spacing-md); text-align: center;">
                    No connections configured. Click "Edit Flow" to set up patient flow paths.
                </div>
            </div>
            `}
        </div>
    `;
}

// Calculate node positions for n8n-style layout (handles bidirectional connections)
function calculateNodePositions(workflows, connections) {
    const positions = {};
    const levels = {};
    const nodeWidth = 140;
    const nodeHeight = 100;
    const horizontalSpacing = 280;
    const verticalSpacing = 150;

    // Build dependency graph to determine levels (handles bidirectional)
    const visited = new Set();

    // Start with receptionist at level 0
    if (workflows.includes('receptionist')) {
        const queue = [{ id: 'receptionist', level: 0 }];
        levels['receptionist'] = 0;
        visited.add('receptionist');

        // BFS to assign levels (forward direction only for initial layout)
        while (queue.length > 0) {
            const current = queue.shift();
            const targets = connections[current.id] || [];

            targets.forEach(targetId => {
                if (!visited.has(targetId) && workflows.includes(targetId)) {
                    const newLevel = current.level + 1;
                    // If node already has a level, use the minimum (earliest level)
                    if (!levels[targetId] || levels[targetId] > newLevel) {
                        levels[targetId] = newLevel;
                    }
                    visited.add(targetId);
                    queue.push({ id: targetId, level: newLevel });
                }
            });
        }
    }

    // Assign remaining nodes to max level + 1
    workflows.forEach(id => {
        if (!visited.has(id)) {
            const maxLevel = Math.max(...Object.values(levels), -1);
            levels[id] = maxLevel + 1;
        }
    });

    // Group nodes by level
    const nodesByLevel = {};
    workflows.forEach(id => {
        const level = levels[id] || 0;
        if (!nodesByLevel[level]) nodesByLevel[level] = [];
        nodesByLevel[level].push(id);
    });

    // Calculate positions with proper alignment
    const maxLevel = Math.max(...Object.keys(nodesByLevel).map(Number), 0);
    const startX = 100;
    const startY = 100;

    // Sort levels and assign positions
    Object.keys(nodesByLevel).sort((a, b) => parseInt(a) - parseInt(b)).forEach(level => {
        const nodes = nodesByLevel[level];
        const levelNum = parseInt(level);
        const x = startX + (levelNum * horizontalSpacing);

        // Calculate total height needed for this level
        const totalHeight = (nodes.length - 1) * verticalSpacing;
        // Center nodes vertically within the canvas
        const maxNodesInAnyLevel = Math.max(...Object.values(nodesByLevel).map(arr => arr.length), 1);
        const canvasHeight = maxNodesInAnyLevel * verticalSpacing;
        const startYForLevel = startY + ((canvasHeight - totalHeight) / 2);

        nodes.forEach((id, idx) => {
            positions[id] = {
                x: x,
                y: startYForLevel + (idx * verticalSpacing)
            };
        });
    });

    return { positions, levels };
}

// Update SVG connection lines based on actual node positions (n8n-style)
function updateWorkflowConnections() {
    const canvas = document.querySelector('.workflow-canvas');
    if (!canvas) return;

    const svg = canvas.querySelector('.workflow-connections');
    if (!svg) return;

    const workflows = getCustomWorkflows();
    const connections = getWorkflowConnections();
    const config = getHospitalConfig();
    const enabledWorkflows = (config.enabledWorkflows || []).filter(id => id !== 'admin');

    // Build connection list
    const allConnections = [];
    enabledWorkflows.forEach(id => {
        const targets = (connections[id] || []).filter(tId => enabledWorkflows.includes(tId) && tId !== 'completed');
        targets.forEach(targetId => {
            allConnections.push({ from: id, to: targetId });
        });
    });

    if (allConnections.length === 0) {
        svg.innerHTML = '<defs><marker id="arrowhead-default" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><polygon points="0 0, 10 3, 0 6" fill="#667eea" opacity="0.7" /></marker></defs>';
        return;
    }

    // Get container for accurate positioning
    const container = canvas.querySelector('.workflow-nodes-container');
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    // Get actual node positions
    const paths = allConnections.map((conn, idx) => {
        const fromNode = canvas.querySelector(`[data-workflow-id="${conn.from}"]`);
        const toNode = canvas.querySelector(`[data-workflow-id="${conn.to}"]`);

        if (!fromNode || !toNode) return '';

        const fromRect = fromNode.getBoundingClientRect();
        const toRect = toNode.getBoundingClientRect();

        // Calculate positions relative to container (not canvas, accounting for padding)
        const paddingLeft = parseInt(getComputedStyle(canvas).paddingLeft) || 0;
        const paddingTop = parseInt(getComputedStyle(canvas).paddingTop) || 0;

        // Calculate connection points - lines should connect to the center of the connection point circles
        // Connection points are 6px from the edge (12px diameter circle, 6px radius)
        const connectionPointRadius = 6;
        const x1 = fromRect.right - containerRect.left + connectionPointRadius;
        const y1 = fromRect.top - containerRect.top + (fromRect.height / 2);
        const x2 = toRect.left - containerRect.left - connectionPointRadius;
        const y2 = toRect.top - containerRect.top + (toRect.height / 2);

        // Check if this is a back-connection by comparing node levels
        const levelsJson = canvas.getAttribute('data-node-levels');
        const nodeLevels = levelsJson ? JSON.parse(levelsJson) : {};
        const fromLevel = nodeLevels[conn.from] ?? 999;
        const toLevel = nodeLevels[conn.to] ?? 999;
        // Only mark as back-connection if target level is strictly less than source level
        const isBackConnection = (toLevel < fromLevel) && (fromLevel !== 999 && toLevel !== 999);

        // Use source node's color for the connection line (matches the node border color)
        const connectionColor = workflows[conn.from]?.color || '#667eea';

        if (isBackConnection) {
            // Back-connection: use dashed line with more pronounced curve
            const midX = (x1 + x2) / 2;
            const curveOffset = Math.abs(x1 - x2) * 0.3;
            const path = `M ${x1} ${y1} C ${midX + curveOffset} ${y1 - curveOffset}, ${midX + curveOffset} ${y2 - curveOffset}, ${x2} ${y2}`;
            return `<path d="${path}" stroke="${connectionColor}" stroke-width="2.5" fill="none" stroke-dasharray="5,5" marker-end="url(#arrowhead-default-${idx})" opacity="0.8" />`;
        } else {
            // Forward connection: smooth curve
            const controlX = (x1 + x2) / 2;
            const path = `M ${x1} ${y1} C ${controlX} ${y1}, ${controlX} ${y2}, ${x2} ${y2}`;
            return `<path d="${path}" stroke="${connectionColor}" stroke-width="2.5" fill="none" marker-end="url(#arrowhead-default-${idx})" opacity="0.7" />`;
        }
    }).join('');

    // Generate arrowhead markers for each connection (using source node's color)
    const markers = allConnections.map((conn, idx) => {
        const connectionColor = workflows[conn.from]?.color || '#667eea';
        return `
            <marker id="arrowhead-default-${idx}" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                <polygon points="0 0, 10 3, 0 6" fill="${connectionColor}" opacity="0.8" />
            </marker>
        `;
    }).join('');

    svg.innerHTML = `
        ${paths}
        <defs>
            ${markers}
        </defs>
    `;
}

function renderFlowPath(enabledWorkflows, workflows, connections) {
    // Build the flow path starting from receptionist
    const visited = new Set();
    const path = [];

    function buildPath(nodeId, depth = 0) {
        if (visited.has(nodeId) || depth > 10) return;
        visited.add(nodeId);

        const wf = workflows[nodeId] || WORKFLOW_TEMPLATES[nodeId];
        if (wf && enabledWorkflows.includes(nodeId)) {
            path.push({
                id: nodeId,
                ...wf,
                targets: connections[nodeId] || []
            });
        }

        (connections[nodeId] || []).forEach(targetId => {
            if (!visited.has(targetId) && enabledWorkflows.includes(targetId)) {
                buildPath(targetId, depth + 1);
            }
        });
    }

    buildPath('receptionist');

    // Render the path
    return path.map((node, idx) => `
        <div style="display: flex; align-items: center; gap: var(--spacing-xs);">
            <span style="
                background: ${node.color}20;
                color: ${node.color};
                padding: 4px 12px;
                border-radius: var(--radius-md);
                font-size: 0.85rem;
                font-weight: 600;
            ">${node.icon} ${node.name}</span>
            ${node.targets.length > 0 && idx < path.length - 1 ? '<span style="color: var(--text-muted);">→</span>' : ''}
        </div>
    `).join('');
}

// Render workflow diagram
function renderWorkflowDiagram(config) {
    const activeWorkflows = config.workflowOrder.filter(id => config.enabledWorkflows.includes(id));

    return `
        <div style="display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: var(--spacing-md); padding: var(--spacing-lg);">
            ${activeWorkflows.map((id, index) => {
        const template = WORKFLOW_TEMPLATES[id];
        return `
                    <div style="display: flex; align-items: center;">
                        <div style="
                            background: ${template.color}20;
                            border: 2px solid ${template.color};
                            border-radius: var(--radius-lg);
                            padding: var(--spacing-md) var(--spacing-lg);
                            text-align: center;
                            min-width: 120px;
                        ">
                            <div style="font-size: 1.5rem;">${template.icon}</div>
                            <div style="font-weight: 600; color: ${template.color};">${template.name}</div>
                        </div>
                        ${index < activeWorkflows.length - 1 ? `
                            <div style="font-size: 1.5rem; color: var(--text-muted); margin: 0 var(--spacing-sm);">→</div>
                        ` : ''}
                    </div>
                `;
    }).join('')}
        </div>
        <p style="text-align: center; color: var(--text-muted); font-size: 0.85rem; margin-top: var(--spacing-md);">
            Patients flow through each workflow step automatically
        </p>
    `;
}

// Render a single template card
function renderTemplateCard(template, config) {
    const isEnabled = config.enabledWorkflows.includes(template.id);
    const isSystem = template.isSystem;
    const isCustom = template.isCustom || false;

    // Get customized template if exists
    const customTemplates = loadFromStorage('customTemplates', {});
    const displayTemplate = customTemplates[template.id] || template;

    return `
        <div class="template-card ${isEnabled ? 'enabled' : 'disabled'}" style="
            background: var(--bg-card);
            border-radius: var(--radius-lg);
            padding: var(--spacing-lg);
            border-left: 4px solid ${displayTemplate.color};
            opacity: ${isEnabled ? '1' : '0.6'};
        ">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--spacing-md);">
                <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <span style="font-size: 2rem;">${displayTemplate.icon}</span>
                    <div>
                        <h4 style="margin: 0; color: ${displayTemplate.color};">${displayTemplate.name}</h4>
                        <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted);">${displayTemplate.description}</p>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <button class="btn btn-small" onclick="openTemplateEditor('${template.id}')" 
                            style="padding: 4px 8px; font-size: 0.75rem;">
                        ✏️ Edit
                    </button>
                    ${template.id !== 'admin' ? `
                    <button class="btn btn-small btn-danger" onclick="confirmDeleteWorkflow('${template.id}', ${template.isCustom || false})" 
                            style="padding: 4px 8px; font-size: 0.75rem; background: var(--danger-color);"
                            title="${template.isCustom ? 'Delete permanently' : 'Delete (can be restored)'}">
                        🗑️ Delete
                    </button>
                    ` : ''}
                    <label class="toggle-switch" ${isSystem ? 'title="System role - cannot be disabled"' : ''}>
                        <input type="checkbox" 
                               class="template-toggle" 
                               data-template-id="${template.id}"
                               ${isEnabled ? 'checked' : ''} 
                               ${isSystem ? 'disabled' : ''}>
                        <span class="toggle-slider ${isSystem ? 'system' : ''}"></span>
                    </label>
                </div>
            </div>
            
            <div style="margin-bottom: var(--spacing-md);">
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: var(--spacing-xs);">FEATURES:</div>
                <ul style="margin: 0; padding-left: var(--spacing-lg); font-size: 0.85rem; color: var(--text-secondary);">
                    ${(displayTemplate.features || []).map(f => `<li>${f}</li>`).join('')}
                    ${(!displayTemplate.features || displayTemplate.features.length === 0) ? '<li>No features listed</li>' : ''}
                </ul>
            </div>
            
            <div style="
                background: var(--bg-secondary);
                padding: var(--spacing-sm) var(--spacing-md);
                border-radius: var(--radius-md);
                font-size: 0.8rem;
                color: var(--text-muted);
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <span><strong>Flow:</strong> ${displayTemplate.workflow}</span>
                ${customTemplates[template.id] ? '<span style="color: var(--secondary-color);">✓ Customized</span>' : ''}
            </div>
        </div>
    `;
}

// Toggle workflow on/off
function toggleWorkflow(templateId, enabled) {
    const config = getHospitalConfig();
    const customTemplates = loadFromStorage('customTemplates', {});
    const template = customTemplates[templateId] || WORKFLOW_TEMPLATES[templateId];

    if (enabled) {
        if (!config.enabledWorkflows.includes(templateId)) {
            config.enabledWorkflows.push(templateId);
        }
    } else {
        config.enabledWorkflows = config.enabledWorkflows.filter(id => id !== templateId);
    }

    saveHospitalConfig(config);
    showNotification(`${template.name} workflow ${enabled ? 'enabled' : 'disabled'}`, enabled ? 'success' : 'info');
    renderTemplatesPage();
}

// Confirm and delete workflow
function confirmDeleteWorkflow(workflowId, isCustom) {
    const workflows = getCustomWorkflows();
    const workflow = workflows[workflowId];
    if (!workflow) {
        // Try to get from default templates
        const defaultWorkflow = WORKFLOW_TEMPLATES[workflowId];
        if (defaultWorkflow) {
            deleteWorkflow(workflowId, false);
            return;
        }
        showNotification('Workflow not found', 'error');
        return;
    }

    const workflowName = workflow.name || workflowId;

    const message = isCustom
        ? `Are you sure you want to permanently delete "${workflowName}"? This action cannot be undone.`
        : `Are you sure you want to delete "${workflowName}"? This is a default workflow and can be restored later.`;

    if (confirm(message)) {
        deleteWorkflow(workflowId, isCustom);
    }
}

// Delete workflow
function deleteWorkflow(workflowId, isCustom) {
    const config = getHospitalConfig();

    // Check if it's actually a custom workflow
    const customWorkflows = loadFromStorage('customWorkflows', {});
    const isActuallyCustom = customWorkflows.hasOwnProperty(workflowId);

    if (isActuallyCustom) {
        // Permanently delete custom workflow
        delete customWorkflows[workflowId];
        saveToStorage('customWorkflows', customWorkflows);

        // Remove from enabled workflows
        config.enabledWorkflows = config.enabledWorkflows.filter(id => id !== workflowId);

        // Remove from workflow order
        if (config.workflowOrder) {
            config.workflowOrder = config.workflowOrder.filter(id => id !== workflowId);
        }

        // Remove from search access
        if (config.searchAccess) {
            config.searchAccess = config.searchAccess.filter(id => id !== workflowId);
        }

        // Remove connections
        const connections = getWorkflowConnections();
        delete connections[workflowId];
        // Remove from other workflows' connections
        Object.keys(connections).forEach(key => {
            connections[key] = connections[key].filter(id => id !== workflowId);
        });
        saveWorkflowConnections(connections);

        showNotification(`Custom workflow "${workflowId}" permanently deleted`, 'success');
    } else {
        // Mark default workflow as deleted (can be restored)
        if (!config.deletedWorkflows) {
            config.deletedWorkflows = [];
        }
        if (!config.deletedWorkflows.includes(workflowId)) {
            config.deletedWorkflows.push(workflowId);
        }

        // Remove from enabled workflows
        config.enabledWorkflows = config.enabledWorkflows.filter(id => id !== workflowId);

        // Remove from workflow order
        if (config.workflowOrder) {
            config.workflowOrder = config.workflowOrder.filter(id => id !== workflowId);
        }

        // Remove from search access
        if (config.searchAccess) {
            config.searchAccess = config.searchAccess.filter(id => id !== workflowId);
        }

        // Remove connections
        const connections = getWorkflowConnections();
        delete connections[workflowId];
        // Remove from other workflows' connections
        Object.keys(connections).forEach(key => {
            connections[key] = connections[key].filter(id => id !== workflowId);
        });
        saveWorkflowConnections(connections);

        showNotification(`Default workflow "${workflowId}" deleted. You can restore it from the "Deleted Workflows" section.`, 'info');
    }

    saveHospitalConfig(config);
    renderTemplatesPage();
}

// Restore deleted default workflow
function restoreWorkflow(workflowId) {
    const config = getHospitalConfig();

    if (!config.deletedWorkflows) {
        config.deletedWorkflows = [];
    }

    // Remove from deleted list
    config.deletedWorkflows = config.deletedWorkflows.filter(id => id !== workflowId);

    // Add back to enabled workflows if not already there
    if (!config.enabledWorkflows.includes(workflowId)) {
        config.enabledWorkflows.push(workflowId);
    }

    // Add back to workflow order if not already there
    if (config.workflowOrder && !config.workflowOrder.includes(workflowId)) {
        config.workflowOrder.push(workflowId);
    }

    // Restore default connections
    const connections = getWorkflowConnections();
    const defaultConnections = DEFAULT_WORKFLOW_CONNECTIONS[workflowId];
    if (defaultConnections) {
        connections[workflowId] = [...defaultConnections];
        saveWorkflowConnections(connections);
    }

    saveHospitalConfig(config);
    showNotification(`Workflow "${workflowId}" restored successfully!`, 'success');
    renderTemplatesPage();
}

// ==========================================
// TEMPLATE EDITOR (LCNC No-Code Editing)
// ==========================================
function openTemplateEditor(templateId) {
    const workflows = getCustomWorkflows();
    const wf = workflows[templateId];

    if (wf) {
        editingTemplate = templateId;
        // Map default IDs to their form keys, use ID directly for custom ones
        const formTypeMap = {
            'receptionist': 'receptionist',
            'doctor': 'doctor',
            'lab_technician': 'lab'
        };
        currentFormTab = formTypeMap[templateId] || templateId;
        renderTemplatesPage();
    } else {
        showNotification('Template not found', 'error');
    }
}

function closeFormBuilder() {
    editingTemplate = null;
    renderTemplatesPage();
}

// Render the Form Builder page (when editing a template)
function renderFormBuilderPage(templateId) {
    const workflows = getCustomWorkflows();
    const template = workflows[templateId];

    const formTypeMap = {
        'receptionist': 'receptionist',
        'doctor': 'doctor',
        'lab_technician': 'lab'
    };
    const formType = formTypeMap[templateId] || templateId;

    return `
        <!-- Header with Back Button -->
        <div style="display: flex; align-items: center; gap: var(--spacing-md); margin-bottom: var(--spacing-lg);">
            <button class="btn btn-secondary" onclick="closeFormBuilder()" style="display: flex; align-items: center; gap: var(--spacing-xs);">
                ← Back
            </button>
            <div>
                <h2 style="margin: 0; display: flex; align-items: center; gap: var(--spacing-sm);">
                    <span style="font-size: 1.5rem;">${template.icon}</span>
                    Editing: ${template.name}
                </h2>
                <p style="margin: 0; color: var(--text-muted); font-size: 0.9rem;">
                    Customize the form fields for this role - Drag to reorder, click to edit
                </p>
            </div>
        </div>
        
        <!-- Form Builder -->
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">📝 Form Fields</h3>
            </div>
            <div class="card-body">
                <div class="form-builder-area" id="formBuilderArea">
                    ${renderFormBuilder(formType)}
                </div>
            </div>
        </div>
        
        <!-- Template Settings -->
        <div class="card" style="margin-top: var(--spacing-lg);">
            <div class="card-header">
                <h3 class="card-title">⚙️ Template Settings</h3>
            </div>
            <div class="card-body">
                <form id="templateSettingsForm" onsubmit="saveTemplateSettings(event, '${templateId}')">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md);">
                        <div class="form-group">
                            <label class="form-label">Template Name</label>
                            <input type="text" class="form-input" id="editName" value="${template.name}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Icon (Emoji)</label>
                            <input type="text" class="form-input" id="editIcon" value="${template.icon}" style="font-size: 1.5rem; text-align: center;">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Description</label>
                            <input type="text" class="form-input" id="editDescription" value="${template.description}">
                        </div>
                    </div>
                    <div style="margin-top: var(--spacing-md);">
                        <label class="form-label">Color</label>
                        <div style="display: flex; gap: var(--spacing-sm); flex-wrap: wrap;">
                            ${['#48bb78', '#667eea', '#ed8936', '#e53e3e', '#9f7aea', '#38b2ac', '#d69e2e', '#718096'].map(color => `
                                <button type="button" class="color-picker-btn" 
                                        onclick="selectTemplateColor('${color}')" 
                                        style="width: 36px; height: 36px; background: ${color}; border: 3px solid ${template.color === color ? 'white' : 'transparent'}; border-radius: 50%; cursor: pointer;">
                                </button>
                            `).join('')}
                        </div>
                        <input type="hidden" id="editColor" value="${template.color}">
                    </div>
                    <div class="action-buttons" style="margin-top: var(--spacing-lg);">
                        <button type="button" class="btn btn-secondary" onclick="resetTemplateSettings('${templateId}')">
                            🔄 Reset to Default
                        </button>
                        <button type="submit" class="btn btn-primary">
                            💾 Save Settings
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function selectTemplateColor(color) {
    document.getElementById('editColor').value = color;
    document.querySelectorAll('.color-picker-btn').forEach(btn => {
        btn.style.borderColor = btn.style.background === color ? 'white' : 'transparent';
    });
}

function saveTemplateSettings(event, templateId) {
    event.preventDefault();

    const customTemplates = loadFromStorage('customTemplates', {});
    const workflows = getCustomWorkflows();
    const baseTemplate = workflows[templateId] || WORKFLOW_TEMPLATES[templateId] || {};

    customTemplates[templateId] = {
        ...baseTemplate,
        name: document.getElementById('editName').value,
        icon: document.getElementById('editIcon').value,
        description: document.getElementById('editDescription').value,
        color: document.getElementById('editColor').value,
        customized: true,
        lastModified: new Date().toISOString()
    };

    saveToStorage('customTemplates', customTemplates);
    showNotification('Template settings saved!', 'success');
    closeFormBuilder(); // Automatically return to list after saving
}

function resetTemplateSettings(templateId) {
    const modal = document.createElement('div');
    modal.id = 'resetTemplateModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center;
        z-index: 2000;
    `;

    modal.innerHTML = `
        <div style="background: var(--bg-card); border-radius: var(--radius-lg); padding: var(--spacing-xl); 
                    width: 400px; max-width: 95%; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: var(--spacing-md);">🔄</div>
            <h3 style="margin: 0 0 var(--spacing-md) 0;">Reset Template?</h3>
            <p style="color: var(--text-muted); margin-bottom: var(--spacing-lg);">
                This will restore template settings to default.
            </p>
            <div class="action-buttons" style="justify-content: center;">
                <button class="btn btn-secondary" onclick="closeResetTemplateModal()">Cancel</button>
                <button class="btn btn-primary" onclick="confirmResetTemplate('${templateId}')">🔄 Reset</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function closeResetTemplateModal() {
    const modal = document.getElementById('resetTemplateModal');
    if (modal) modal.remove();
}

function confirmResetTemplate(templateId) {
    closeResetTemplateModal();
    const customTemplates = loadFromStorage('customTemplates', {});
    delete customTemplates[templateId];
    saveToStorage('customTemplates', customTemplates);
    showNotification('Template reset to default', 'info');
    renderTemplatesPage();
}

// Add CSS for toggle switch
const toggleStyles = document.createElement('style');
toggleStyles.textContent = `
    .templates-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        gap: var(--spacing-lg);
    }
    
    .toggle-switch {
        position: relative;
        display: inline-block;
        width: 50px;
        height: 26px;
    }
    
    .toggle-switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }
    
    .toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--bg-secondary);
        border-radius: 26px;
        transition: var(--transition-normal);
    }
    
    .toggle-slider:before {
        position: absolute;
        content: "";
        height: 20px;
        width: 20px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        border-radius: 50%;
        transition: var(--transition-normal);
    }
    
    .toggle-switch input:checked + .toggle-slider {
        background-color: var(--secondary-color);
    }
    
    .toggle-switch input:checked + .toggle-slider:before {
        transform: translateX(24px);
    }
    
    .toggle-slider.system {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .workflow-diagram {
        background: var(--bg-secondary);
        border-radius: var(--radius-lg);
        padding: var(--spacing-md);
    }
    
    .template-card {
        transition: var(--transition-normal);
    }
    
    .template-card:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg);
    }
    
    /* Form Builder Styles */
    .form-builder-tabs {
        display: flex;
        gap: var(--spacing-sm);
        margin-bottom: var(--spacing-lg);
        border-bottom: 2px solid var(--border-color);
        padding-bottom: var(--spacing-sm);
    }
    
    .form-tab {
        padding: var(--spacing-sm) var(--spacing-md);
        border: none;
        background: var(--bg-secondary);
        color: var(--text-secondary);
        border-radius: var(--radius-md) var(--radius-md) 0 0;
        cursor: pointer;
        font-size: 0.9rem;
        transition: var(--transition-fast);
    }
    
    .form-tab.active {
        background: var(--primary-color);
        color: white;
    }
    
    .form-tab:hover:not(.active) {
        background: var(--bg-card);
    }
    
    .form-builder-area {
        display: grid;
        grid-template-columns: 1fr 250px;
        gap: var(--spacing-lg);
    }
    
    .form-fields-list {
        background: var(--bg-secondary);
        border-radius: var(--radius-lg);
        padding: var(--spacing-md);
        min-height: 300px;
    }
    
    .form-field-item {
        background: var(--bg-card);
        border: 2px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: var(--spacing-md);
        margin-bottom: var(--spacing-sm);
        cursor: grab;
        display: flex;
        align-items: center;
        gap: var(--spacing-md);
        transition: var(--transition-fast);
    }
    
    .form-field-item:hover {
        border-color: var(--primary-color);
        box-shadow: var(--shadow-sm);
    }
    
    .form-field-item.dragging {
        opacity: 0.5;
        border-style: dashed;
    }
    
    .form-field-item.drag-over {
        border-color: var(--secondary-color);
        background: var(--secondary-color)10;
    }
    
    .field-drag-handle {
        font-size: 1.2rem;
        color: var(--text-muted);
        cursor: grab;
    }
    
    .field-info {
        flex: 1;
    }
    
    .field-label {
        font-weight: 600;
        color: var(--text-primary);
    }
    
    .field-type {
        font-size: 0.75rem;
        color: var(--text-muted);
    }
    
    .field-actions {
        display: flex;
        gap: var(--spacing-xs);
    }
    
    .field-action-btn {
        padding: 4px 8px;
        border: none;
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-size: 0.8rem;
        transition: var(--transition-fast);
    }
    
    .field-action-btn:hover {
        background: var(--primary-color);
        color: white;
    }
    
    .field-action-btn.delete:hover {
        background: var(--danger-color);
    }
    
    .add-field-panel {
        background: var(--bg-card);
        border-radius: var(--radius-lg);
        padding: var(--spacing-md);
    }
    
    .add-field-panel h4 {
        margin-bottom: var(--spacing-md);
        font-size: 0.9rem;
    }
    
    .field-type-btn {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        width: 100%;
        padding: var(--spacing-sm);
        border: 1px solid var(--border-color);
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
        cursor: pointer;
        margin-bottom: var(--spacing-xs);
        font-size: 0.85rem;
        transition: var(--transition-fast);
    }
    
    .field-type-btn:hover {
        border-color: var(--primary-color);
        background: var(--primary-color)10;
    }
`;
document.head.appendChild(toggleStyles);

// ==========================================
// FORM BUILDER FUNCTIONS
// ==========================================

function loadFormFields() {
    const saved = loadFromStorage('customFormFields', null);
    if (!saved) {
        saveToStorage('customFormFields', DEFAULT_FORM_FIELDS);
    }
}

// Get fields for a specific form
function getFormFields(formType) {
    const customFields = loadFromStorage('customFormFields', DEFAULT_FORM_FIELDS);
    // If no custom fields for this role yet, return default or empty array
    if (!customFields[formType]) {
        return DEFAULT_FORM_FIELDS[formType] || [];
    }
    return customFields[formType];
}

function saveFormFields(formType, fields) {
    const allFields = loadFromStorage('customFormFields', DEFAULT_FORM_FIELDS);
    allFields[formType] = fields;
    saveToStorage('customFormFields', allFields);
}

function switchFormTab(tab) {
    currentFormTab = tab;
    renderTemplatesPage();
}

function renderFormBuilder(formType) {
    const fields = getFormFields(formType);

    return `
        <div class="form-fields-list" id="fieldsList">
            <div style="margin-bottom: var(--spacing-md); display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600; color: var(--text-secondary);">Form Fields (${fields.length})</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">Drag to reorder</span>
            </div>
            ${fields.length === 0 ? `
                <div style="text-align: center; padding: var(--spacing-xl); color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: var(--spacing-sm);">📝</div>
                    <p>No fields yet. Add fields from the panel →</p>
                </div>
            ` : fields.map((field, index) => `
                <div class="form-field-item" draggable="true" 
                     data-index="${index}"
                     ondragstart="handleDragStart(event, ${index})"
                     ondragover="handleDragOver(event)"
                     ondrop="handleDrop(event, ${index})"
                     ondragend="handleDragEnd(event)">
                    <span class="field-drag-handle">⋮⋮</span>
                    <div class="field-info">
                        <div class="field-label">${field.label} ${field.required ? '<span style="color: var(--danger-color);">*</span>' : ''}</div>
                        <div class="field-type">${getFieldTypeLabel(field.type)} ${field.options ? `(${field.options.length} options)` : ''}</div>
                    </div>
                    <div class="field-actions">
                        <button class="field-action-btn" onclick="editField('${formType}', ${index})">✏️</button>
                        <button class="field-action-btn delete" onclick="deleteField('${formType}', ${index})">🗑️</button>
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div class="add-field-panel">
            <h4>➕ Add New Field</h4>
            ${FIELD_TYPES.map(ft => `
                <button class="field-type-btn" onclick="addNewField('${formType}', '${ft.type}')">
                    <span>${ft.icon}</span>
                    <span>${ft.label}</span>
                </button>
            `).join('')}
            
            <div style="margin-top: var(--spacing-lg); padding-top: var(--spacing-md); border-top: 1px solid var(--border-color);">
                <button class="btn btn-secondary" style="width: 100%; font-size: 0.85rem;" onclick="resetFormFields('${formType}')">
                    🔄 Reset to Default
                </button>
            </div>
        </div>
    `;
}

function getFieldTypeLabel(type) {
    const ft = FIELD_TYPES.find(f => f.type === type);
    return ft ? `${ft.icon} ${ft.label}` : type;
}

// Drag and Drop handlers
let draggedIndex = null;

function handleDragStart(event, index) {
    draggedIndex = index;
    event.target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('drag-over');
}

function handleDrop(event, dropIndex) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');

    if (draggedIndex !== null && draggedIndex !== dropIndex) {
        const fields = getFormFields(currentFormTab);
        const draggedField = fields[draggedIndex];

        // Remove from old position
        fields.splice(draggedIndex, 1);
        // Insert at new position
        fields.splice(dropIndex, 0, draggedField);

        saveFormFields(currentFormTab, fields);
        showNotification('Field order updated', 'success');
        renderTemplatesPage();
    }
}

function handleDragEnd(event) {
    event.target.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    draggedIndex = null;
}

// Add new field
function addNewField(formType, fieldType) {
    const fields = getFormFields(formType);
    const newId = 'field_' + Date.now();

    const newField = {
        id: newId,
        label: `New ${FIELD_TYPES.find(f => f.type === fieldType).label}`,
        type: fieldType,
        required: false,
        placeholder: ''
    };

    if (fieldType === 'select') {
        newField.options = ['Option 1', 'Option 2', 'Option 3'];
    }

    fields.push(newField);
    saveFormFields(formType, fields);
    showNotification('Field added! Click ✏️ to edit', 'success');
    renderTemplatesPage();

    // Open editor for new field
    setTimeout(() => editField(formType, fields.length - 1), 100);
}

// Delete field
function deleteField(formType, index) {
    const fields = getFormFields(formType);
    const field = fields[index];

    const modal = document.createElement('div');
    modal.id = 'deleteConfirmModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center;
        z-index: 2000;
    `;

    modal.innerHTML = `
        <div style="background: var(--bg-card); border-radius: var(--radius-lg); padding: var(--spacing-xl); 
                    width: 400px; max-width: 95%; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: var(--spacing-md);">🗑️</div>
            <h3 style="margin: 0 0 var(--spacing-md) 0;">Delete Field?</h3>
            <p style="color: var(--text-muted); margin-bottom: var(--spacing-lg);">
                Are you sure you want to delete "<strong>${field.label}</strong>"?
            </p>
            <div class="action-buttons" style="justify-content: center;">
                <button class="btn btn-secondary" onclick="closeDeleteModal()">Cancel</button>
                <button class="btn btn-danger" onclick="confirmDeleteField('${formType}', ${index})">🗑️ Delete</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.remove();
}

function confirmDeleteField(formType, index) {
    closeDeleteModal();
    const fields = getFormFields(formType);
    fields.splice(index, 1);
    saveFormFields(formType, fields);
    showNotification('Field deleted', 'info');
    renderTemplatesPage();
}

// Edit field
function editField(formType, index) {
    const fields = getFormFields(formType);
    const field = fields[index];

    const modal = document.createElement('div');
    modal.id = 'fieldEditorModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center;
        z-index: 2000; padding: var(--spacing-lg);
    `;

    modal.innerHTML = `
        <div style="background: var(--bg-card); border-radius: var(--radius-lg); padding: var(--spacing-xl); 
                    width: 500px; max-width: 95%;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-lg);">
                <h3 style="margin: 0;">✏️ Edit Field</h3>
                <button onclick="closeFieldEditor()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">✕</button>
            </div>
            
            <form id="fieldEditorForm">
                <div class="form-group" style="margin-bottom: var(--spacing-md);">
                    <label class="form-label">Field Label</label>
                    <input type="text" class="form-input" id="editFieldLabel" value="${field.label}" required>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-md); margin-bottom: var(--spacing-md);">
                    <div class="form-group">
                        <label class="form-label">Field Type</label>
                        <select class="form-input" id="editFieldType" onchange="toggleOptionsField()">
                            ${FIELD_TYPES.map(ft => `<option value="${ft.type}" ${field.type === ft.type ? 'selected' : ''}>${ft.icon} ${ft.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Required?</label>
                        <select class="form-input" id="editFieldRequired">
                            <option value="true" ${field.required ? 'selected' : ''}>Yes - Required</option>
                            <option value="false" ${!field.required ? 'selected' : ''}>No - Optional</option>
                        </select>
                    </div>
                </div>
                
                <div class="form-group" style="margin-bottom: var(--spacing-md);">
                    <label class="form-label">Placeholder Text</label>
                    <input type="text" class="form-input" id="editFieldPlaceholder" value="${field.placeholder || ''}">
                </div>
                
                <div class="form-group" id="optionsGroup" style="margin-bottom: var(--spacing-md); ${field.type === 'select' ? '' : 'display: none;'}">
                    <label class="form-label">Options (one per line)</label>
                    <textarea class="form-textarea" id="editFieldOptions" rows="4">${field.options ? field.options.join('\n') : ''}</textarea>
                </div>
                
                <div class="action-buttons">
                    <button type="button" class="btn btn-secondary" onclick="closeFieldEditor()">Cancel</button>
                    <button type="submit" class="btn btn-primary">💾 Save Field</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('fieldEditorForm').addEventListener('submit', function (e) {
        e.preventDefault();
        saveFieldChanges(formType, index);
    });
}

function toggleOptionsField() {
    const type = document.getElementById('editFieldType').value;
    document.getElementById('optionsGroup').style.display = type === 'select' ? 'block' : 'none';
}

function closeFieldEditor() {
    const modal = document.getElementById('fieldEditorModal');
    if (modal) modal.remove();
}

function saveFieldChanges(formType, index) {
    const fields = getFormFields(formType);
    const type = document.getElementById('editFieldType').value;

    fields[index] = {
        ...fields[index],
        label: document.getElementById('editFieldLabel').value,
        type: type,
        required: document.getElementById('editFieldRequired').value === 'true',
        placeholder: document.getElementById('editFieldPlaceholder').value
    };

    if (type === 'select') {
        const optionsText = document.getElementById('editFieldOptions').value;
        fields[index].options = optionsText.split('\n').filter(o => o.trim() !== '');
    } else {
        delete fields[index].options;
    }

    saveFormFields(formType, fields);
    closeFieldEditor();
    showNotification('Field saved!', 'success');
    renderTemplatesPage();
}

function resetFormFields(formType) {
    const modal = document.createElement('div');
    modal.id = 'resetConfirmModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center;
        z-index: 2000;
    `;

    modal.innerHTML = `
        <div style="background: var(--bg-card); border-radius: var(--radius-lg); padding: var(--spacing-xl); 
                    width: 400px; max-width: 95%; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: var(--spacing-md);">🔄</div>
            <h3 style="margin: 0 0 var(--spacing-md) 0;">Reset Form?</h3>
            <p style="color: var(--text-muted); margin-bottom: var(--spacing-lg);">
                This will restore all default fields. Your customizations will be lost.
            </p>
            <div class="action-buttons" style="justify-content: center;">
                <button class="btn btn-secondary" onclick="closeResetModal()">Cancel</button>
                <button class="btn btn-primary" onclick="confirmResetForm('${formType}')">🔄 Reset</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function closeResetModal() {
    const modal = document.getElementById('resetConfirmModal');
    if (modal) modal.remove();
}

function confirmResetForm(formType) {
    closeResetModal();
    const allFields = loadFromStorage('customFormFields', DEFAULT_FORM_FIELDS);
    allFields[formType] = [...DEFAULT_FORM_FIELDS[formType]];
    saveToStorage('customFormFields', allFields);
    showNotification('Form reset to default', 'info');
    renderTemplatesPage();
}

// ==========================================
// WORKFLOW DESIGNER (n8n-like flow builder)
// ==========================================
function openWorkflowDesigner() {
    const workflows = getCustomWorkflows();
    const connections = getWorkflowConnections();
    const config = getHospitalConfig();

    const modal = document.createElement('div');
    modal.id = 'workflowDesignerModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.95); display: flex; align-items: center; justify-content: center;
        z-index: 2000; padding: var(--spacing-lg);
    `;

    modal.innerHTML = `
        <div style="background: var(--bg-card); border-radius: var(--radius-lg); padding: var(--spacing-xl); 
                    width: 900px; max-width: 95%; max-height: 90vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-lg);">
                <h2 style="margin: 0;">🔗 Workflow Designer</h2>
                <button onclick="closeWorkflowDesigner()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">✕</button>
            </div>
            
            <p style="color: var(--text-muted); margin-bottom: var(--spacing-lg);">
                Configure which roles can forward patients to other roles. Click checkboxes to enable/disable connections.
            </p>
            
            <!-- Connection Matrix -->
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                    <thead>
                        <tr style="background: var(--bg-secondary);">
                            <th style="padding: 12px; text-align: left; border: 1px solid var(--border-color);">From ↓ / To →</th>
                            ${Object.keys(workflows).filter(id => id !== 'admin').map(id => `
                                <th style="padding: 12px; text-align: center; border: 1px solid var(--border-color);">
                                    ${workflows[id].icon}<br>${workflows[id].name}
                                </th>
                            `).join('')}
                            <th style="padding: 12px; text-align: center; border: 1px solid var(--border-color);">
                                ✅<br>Completed
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.keys(workflows).filter(id => id !== 'admin').map(fromId => `
                            <tr>
                                <td style="padding: 12px; border: 1px solid var(--border-color); font-weight: 600;">
                                    ${workflows[fromId].icon} ${workflows[fromId].name}
                                </td>
                                ${Object.keys(workflows).filter(id => id !== 'admin').map(toId => `
                                    <td style="padding: 12px; text-align: center; border: 1px solid var(--border-color);">
                                        ${fromId === toId ? '<span style="color: var(--text-muted);">-</span>' : `
                                            <input type="checkbox" 
                                                   id="conn_${fromId}_${toId}"
                                                   ${(connections[fromId] || []).includes(toId) ? 'checked' : ''}
                                                   onchange="toggleConnection('${fromId}', '${toId}', this.checked)">
                                        `}
                                    </td>
                                `).join('')}
                                <td style="padding: 12px; text-align: center; border: 1px solid var(--border-color);">
                                    <input type="checkbox" 
                                           id="conn_${fromId}_completed"
                                           ${(connections[fromId] || []).includes('completed') ? 'checked' : ''}
                                           onchange="toggleConnection('${fromId}', 'completed', this.checked)">
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <div class="action-buttons" style="margin-top: var(--spacing-lg);">
                <button class="btn btn-secondary" onclick="resetConnections()">🔄 Reset to Default</button>
                <button class="btn btn-primary" onclick="closeWorkflowDesigner()">✓ Done</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function closeWorkflowDesigner() {
    const modal = document.getElementById('workflowDesignerModal');
    if (modal) modal.remove();
    renderTemplatesPage();
}

function toggleConnection(fromId, toId, enabled) {
    const connections = getWorkflowConnections();

    if (!connections[fromId]) {
        connections[fromId] = [];
    }

    if (enabled) {
        if (!connections[fromId].includes(toId)) {
            connections[fromId].push(toId);
        }
    } else {
        connections[fromId] = connections[fromId].filter(id => id !== toId);
    }

    saveWorkflowConnections(connections);

    console.log(`Connection ${enabled ? 'enabled' : 'disabled'}: ${fromId} → ${toId}`);
    console.log('Updated connections:', connections);

    showNotification(`Connection ${enabled ? 'enabled' : 'disabled'}: ${fromId} → ${toId}`, 'success');
}

function resetConnections() {
    saveWorkflowConnections(DEFAULT_WORKFLOW_CONNECTIONS);
    closeWorkflowDesigner();
    showNotification('Connections reset to default', 'info');
}

// ==========================================
// CREATE NEW WORKFLOW/ROLE
// ==========================================
function openCreateWorkflow() {
    const modal = document.createElement('div');
    modal.id = 'createWorkflowModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center;
        z-index: 2000; padding: var(--spacing-lg);
    `;

    modal.innerHTML = `
        <div style="background: var(--bg-card); border-radius: var(--radius-lg); padding: var(--spacing-xl); 
                    width: 500px; max-width: 95%;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-lg);">
                <h3 style="margin: 0;">➕ Create New Role</h3>
                <button onclick="closeCreateWorkflow()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">✕</button>
            </div>
            
            <form id="createWorkflowForm">
                <div class="form-group" style="margin-bottom: var(--spacing-md);">
                    <label class="form-label">Role Name</label>
                    <input type="text" class="form-input" id="newRoleName" placeholder="e.g., Pharmacist" required>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-md); margin-bottom: var(--spacing-md);">
                    <div class="form-group">
                        <label class="form-label">Icon (Emoji)</label>
                        <input type="text" class="form-input" id="newRoleIcon" value="👤" style="font-size: 1.5rem; text-align: center;">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Color</label>
                        <input type="color" class="form-input" id="newRoleColor" value="#667eea" style="height: 42px;">
                    </div>
                </div>
                
                <div class="form-group" style="margin-bottom: var(--spacing-md);">
                    <label class="form-label">Description</label>
                    <input type="text" class="form-input" id="newRoleDescription" placeholder="Brief description of this role">
                </div>
                
                <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                    <label class="form-label">Features (one per line)</label>
                    <textarea class="form-textarea" id="newRoleFeatures" rows="4" placeholder="Feature 1\nFeature 2\nFeature 3"></textarea>
                </div>
                
                <div class="action-buttons">
                    <button type="button" class="btn btn-secondary" onclick="closeCreateWorkflow()">Cancel</button>
                    <button type="submit" class="btn btn-primary">➕ Create Role</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('createWorkflowForm').addEventListener('submit', function (e) {
        e.preventDefault();
        createNewWorkflow();
    });
}

function closeCreateWorkflow() {
    const modal = document.getElementById('createWorkflowModal');
    if (modal) modal.remove();
}

function createNewWorkflow() {
    const name = document.getElementById('newRoleName').value;
    const icon = document.getElementById('newRoleIcon').value || '👤';
    const color = document.getElementById('newRoleColor').value;
    const description = document.getElementById('newRoleDescription').value;
    const featuresText = document.getElementById('newRoleFeatures').value;
    const features = featuresText.split('\n').filter(f => f.trim() !== '');

    // Generate ID from name
    const id = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    if (!id) {
        showNotification('Please enter a valid role name', 'error');
        return;
    }

    // Save new workflow
    const customWorkflows = loadFromStorage('customWorkflows', {});
    customWorkflows[id] = {
        id: id,
        name: name,
        icon: icon,
        color: color,
        description: description,
        enabled: true,
        features: features.length > 0 ? features : ['Custom workflow'],
        workflow: 'Custom workflow',
        isCustom: true
    };
    saveToStorage('customWorkflows', customWorkflows);

    // Add to hospital config
    const config = getHospitalConfig();
    if (!config.enabledWorkflows.includes(id)) {
        config.enabledWorkflows.push(id);
    }
    if (!config.workflowOrder.includes(id)) {
        config.workflowOrder.push(id);
    }
    saveHospitalConfig(config);

    // Add connections for new workflow - default to "completed" so they can finish patient journey
    const connections = getWorkflowConnections();
    connections[id] = ['completed']; // Allow new roles to complete patients by default
    saveWorkflowConnections(connections);

    closeCreateWorkflow();
    showNotification(`${name} role created! You can now switch to this role using the role switcher.`, 'success');
    renderTemplatesPage();

    // Refresh role indicator if we're on a page that has it
    // (This will update the role switcher to include the new role)
    if (typeof renderRoleIndicator === 'function') {
        renderRoleIndicator();
    }
}

// ==========================================
// INITIALIZATION (must be at the end)
// ==========================================
// Initialize templates page
function initTemplatesPage() {
    console.log('Initializing templates page...');
    initPage('templates');
    loadHospitalConfig();
    loadFormFields();

    // Ensure DOM is ready before rendering
    if (document.getElementById('templatesContent')) {
        renderTemplatesPage();
    } else {
        console.error('templatesContent element not found, retrying...');
        setTimeout(() => {
            if (document.getElementById('templatesContent')) {
                renderTemplatesPage();
            } else {
                console.error('templatesContent element still not found after retry');
            }
        }, 100);
    }
}

// Check if DOM is already ready, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        await initRemoteStorage();
        initTemplatesPage();
    });
} else {
    // DOM is already ready, initialize immediately
    (async () => {
        await initRemoteStorage();
        initTemplatesPage();
    })();
}
