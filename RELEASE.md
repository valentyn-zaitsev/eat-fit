# Eat&Fit v1.0.0

Eat&Fit is a calorie and macro tracking web application. It provides a personal product database, reusable recipes, daily meal logging with adjustable portions, and calorie & macro target tracking with live progress bars. All data is stored locally in the browser using SQLite. The app is built as a Progressive Web App (PWA), so it can be installed on any device — phone, tablet, or desktop — directly from the browser.

---

## Approach

The app follows an offline-first architecture. All data lives in a local SQLite database (via WebAssembly) and works without any server or internet connection. Multi-device synchronization is available as an optional feature through Firebase Firestore, using a shared room code to link devices — no registration or login required.

The UI is built with React Native (Expo) targeting web, using Material Design components (react-native-paper). Navigation is handled by expo-router with a tab-based layout.

---

## Features

### Daily Meal Tracking

A date-navigable daily view for logging meals. Meals can be added from saved products, recipes, or entered as a quick meal with custom macro values.

- Date navigation to browse any day
- Add meals from products, recipes, or enter custom macros directly
- Adjustable portion slider (0–100%) with live gram calculation
- Tap any logged meal to edit ingredient weights or remove it

### Calorie & Macro Targets

Configurable daily goals for calories, protein, fat, and carbs. Progress bars update in real time as meals are logged. A built-in auto-distribution splits a calorie target into macros using a 30/25/45 (protein/fat/carbs) ratio.

- Color-coded progress bars for Calories, Protein, Fat, and Carbs
- Eaten / target display with remaining or overflow indicators
- Over-target state highlighted in red
- Individual macro editing — carbs auto-recalculate from remaining calories

### Product Database

A local library of food products with per-100g nutritional values. Products can be searched, created, edited, and deleted. When device sync is enabled, product changes propagate to connected devices automatically.

- Per-100g values: Calories, Protein, Fat, Carbs
- Search and filter
- European decimal format support (comma & dot)

### Recipes

Reusable recipe templates with a list of ingredients and their weights. When logging a recipe as a meal, each ingredient weight can be adjusted individually — macros recalculate live based on the actual weights.

- Recipes with multiple ingredients
- Per-100g and total macro breakdown
- Drag-to-reorder ingredients
- Option to update the source recipe when saving adjusted weights

### Multi-Device Sync

Devices can be linked using a shared room code. Products and recipes synchronize in real time through Firebase Firestore.

- Room-based device pairing via a code word
- Real-time bidirectional sync
- Bulk upload of all local data to a room

### Backup & Restore

Full database export to a JSON file and import from a backup. Import is non-destructive — only entries that don't already exist are added.

- JSON export/import
- Merge-based import (no data overwrite)
- Share via native share sheet or browser download
