# Workflow Integration Guide

## Problem
When Doctor prescribes tablets, patients don't appear in Pharmacist queue because:
1. Doctor workflow doesn't know it can send to Pharmacist
2. Workflow connections need to be configured

## Solution: Connect Doctor to Pharmacist

### Step 1: Configure Workflow Connections

1. Go to **Templates** page
2. Click **"✏️ Edit Flow"** button in the Workflow Designer section
3. In the Workflow Designer modal, you'll see a table showing connections between roles
4. Find the **"Doctor"** row
5. Check the checkbox in the **"Pharmacist"** column
6. Click **"✓ Done"**

This adds `pharmacist` to Doctor's workflow connections.

### Step 2: How It Works

- **Doctor** can now send patients to Pharmacist
- When Doctor processes a patient and clicks "Send to Pharmacist", the patient moves to `queue_pharmacist`
- **Pharmacist** will see the patient in their queue on the Activity page

### Step 3: Using the Connection

**As Doctor:**
1. Select a patient from your queue
2. Enter diagnosis and prescription
3. You'll see a new button: **"💊 Send to Pharmacist"** (or similar based on Pharmacist icon)
4. Click it to forward the patient

**As Pharmacist:**
1. Switch to Pharmacist role using the role switcher
2. Go to Activity page
3. You'll see patients in your queue: **"💊 Waiting for Pharmacist"**
4. Click a patient to process them
5. Fill in the form fields (Patient Name, Medicines, Bill Status, etc.)
6. Forward to next role or mark as completed

## Technical Details

### Workflow Connections Storage
- Stored in: `localStorage['workflowConnections']`
- Format: `{ 'doctor': ['lab_technician', 'billing', 'pharmacist', 'completed'] }`

### Queue System
- Each role has a queue: `queue_<role_id>`
- Pharmacist queue: `queue_pharmacist`
- Patients are moved between queues using `movePatient()` function

### Custom Roles
- Custom roles (like Pharmacist) automatically:
  - Appear in role switcher
  - Have their own queue
  - Use dynamic form fields from Form Builder
  - Show forwarding options based on workflow connections

## Manual Configuration (if needed)

If you need to manually add the connection via browser console:

```javascript
// Get current connections
const connections = JSON.parse(localStorage.getItem('workflowConnections') || '{}');

// Add pharmacist to doctor's targets
if (!connections['doctor']) {
    connections['doctor'] = [];
}
if (!connections['doctor'].includes('pharmacist')) {
    connections['doctor'].push('pharmacist');
}

// Save
localStorage.setItem('workflowConnections', JSON.stringify(connections));

// Refresh page
location.reload();
```

## Notes

- The Doctor view has been updated to show dynamic buttons for custom roles
- Workflow connections are managed in the Templates page → Workflow Designer
- All custom roles automatically integrate with the workflow system

