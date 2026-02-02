# EXEF Frontend v1.2.0 - Refactored Architecture

## Overview
The frontend has been refactored to support:
- URL-based navigation without modals
- Standardized view patterns (Table/Card views)
- Component-based architecture (< 1000 LOC per file)
- Inline editing capabilities
- Expandable rows for hierarchical data

## File Structure
```
frontend/
├── index-new.html          # Main HTML file with Alpine.js templates
├── styles.css             # Centralized CSS styles
├── router.js              # URL-based routing system
└── components/
    ├── profile-manager.js # Profile management component
    └── document-manager.js # Document management component
```

## URL Navigation
All views are accessible via URL parameters:
- `/` - Default view (profiles)
- `/?view=profiles` - Profile management
- `/?view=docs` - Document management
- `/?view=docs&profile=PROFILE_ID` - Documents for specific profile

## View Pattern
Each component follows the standardized pattern:

### State Management
```javascript
function ComponentManager() {
    return {
        viewMode: localStorage.getItem('component_view_mode') || 'table',
        items: [],
        editingItem: null,
        selectedItems: new Set(),
        filters: { /* ... */ },
        
        // Methods
        toggleView(mode) { /* ... */ },
        loadItems() { /* ... */ },
        startEditItem(item) { /* ... */ },
        saveItem() { /* ... */ },
        // ...
    };
}
```

### HTML Template Structure
```html
<template x-if="view=='component'" x-data="ComponentManager()">
    <div>
        <!-- Header with view toggle -->
        <div class="header">
            <h1 class="title">Component</h1>
            <div class="view-toggle">
                <button :class="{active:viewMode=='table'}" @click="toggleView('table')">📊 Tabela</button>
                <button :class="{active:viewMode=='cards'}" @click="toggleView('cards')">📋 Karty</button>
            </div>
        </div>
        
        <!-- Filters -->
        <div class="card">...</div>
        
        <!-- Table View -->
        <template x-if="viewMode=='table'">
            <div class="table-container">
                <table>...</table>
            </div>
        </template>
        
        <!-- Cards View -->
        <template x-if="viewMode=='cards'">
            <div class="cards">...</div>
        </template>
    </div>
</template>
```

## Features

### 1. Profile Management (view=profiles)
- **Table View**: Expandable rows showing delegates
- **Card View**: Quick overview with action buttons
- **Inline Editing**: Click to edit profile details
- **Delegate Management**: Add/edit/remove delegates inline
- **URL**: `/?view=profiles&profile=PROFILE_ID`

### 2. Document Management (view=docs)
- **Table View**: Bulk operations, inline editing
- **Card View**: Visual document cards with status
- **Filters**: By status, type, search
- **Bulk Actions**: Multi-select with status updates
- **URL**: `/?view=docs&profile=PROFILE_ID`

## Inline Editing Pattern
Instead of modals, use inline editing:

```html
<td>
    <template x-if="editingItem?.id == item.id">
        <input class="form-input" x-model="editingItem.field" @click.stop>
    </template>
    <template x-if="!editingItem || editingItem.id != item.id">
        <span class="inline-edit" x-text="item.field"></span>
    </template>
</td>
```

## Expandable Rows
For hierarchical data (profile → delegates):

```html
<tr class="expandable-row" :class="{expanded: expandedRows.has(id)}" @click="toggleExpand(id)">
    <!-- Main row content -->
</tr>
<tr class="expandable-content" :class="{show: expandedRows.has(id)}">
    <td colspan="7">
        <!-- Nested content -->
    </td>
</tr>
```

## Component Communication
Components communicate via:
1. **Global app instance**: `window.appInstance`
2. **Custom events**: `window.dispatchEvent(new CustomEvent('toast', { detail: message }))`
3. **Shared state**: localStorage for view preferences

## CSS Classes
- `.cards` - Grid layout for card view
- `.table-container` - Table wrapper with styling
- `.view-toggle` - Toggle buttons for view modes
- `.inline-edit` - Clickable inline edit fields
- `.expandable-row` - Clickable rows with expand icon
- `.expandable-content` - Hidden content that shows on expand

## Migration from Old Structure
1. Replace modal dialogs with inline editing
2. Add view toggle to each component
3. Implement URL-based navigation
4. Split large files into components (< 1000 LOC)
5. Use standardized CSS classes

## Future Components
Following the same pattern:
- `endpoint-manager.js` - For import/export endpoints
- `upload-manager.js` - For file uploads
- `sign-manager.js` - For document signing
- `export-manager.js` - For data export
