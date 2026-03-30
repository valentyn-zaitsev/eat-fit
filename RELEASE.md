# Eat&Fit

A personal calorie & macro tracking app for iPhone built with **React Native + Expo (SDK 54)**.

## Core Concept
Users build their own product database by scanning nutrition labels (OCR). They then create "Recipe Profiles" (e.g. "Daily Lunch") where they only input the weight of each ingredient to get instant macro calculations.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native + Expo SDK 54 (Managed Workflow) |
| Routing | expo-router v6 (file-based) |
| Database | expo-sqlite v16 (`SQLiteProvider` + `useSQLiteContext`) |
| UI | React Native Paper v5 (Material Design 3) |
| Camera/OCR | expo-camera v17 (OCR integration pending) |
| Icons | @expo/vector-icons v15 (MaterialCommunityIcons) |
| Language | TypeScript |

---

## Project Structure

```
eat-and-fit/
├── app/                        # expo-router screens
│   ├── _layout.tsx             # Root layout: SQLiteProvider + PaperProvider
│   ├── +not-found.tsx          # 404 fallback screen
│   ├── add-product.tsx         # Add/edit product screen
│   ├── scanner.tsx             # Camera OCR screen (placeholder)
│   ├── (tabs)/
│   │   ├── _layout.tsx         # Bottom tab bar layout
│   │   ├── index.tsx           # Products list screen
│   │   └── recipes.tsx         # Recipes list screen
│   └── recipe/
│       └── [id].tsx            # Recipe detail + ingredient builder
├── src/
│   ├── db/
│   │   ├── database.ts         # SQLite schema + initDatabase()
│   │   ├── DbContext.tsx       # React context to share db instance
│   │   ├── productRepository.ts
│   │   └── recipeRepository.ts
│   ├── models/
│   │   ├── Product.ts          # Product interface + calculateMacros() + sumMacros()
│   │   └── Recipe.ts           # Recipe + RecipeIngredient interfaces
│   ├── components/
│   │   └── MacroCard.tsx       # Reusable macro summary card (cal/protein/fat/carbs)
│   └── hooks/
│       └── useDatabase.ts      # Stub hook (DB is initialized in root layout)
├── assets/                     # icon.png, splash.png, adaptive-icon.png, favicon.png
├── app.json                    # Expo config (scheme: "eatandfit", SDK 54)
├── package.json
└── tsconfig.json
```

---

## Data Models

### Product (per 100g)
```typescript
{ id, name, calories, protein, fat, carbs, created_at }
```

### Recipe
```typescript
{ id, name, created_at }
```

### RecipeIngredient
```typescript
{ id, recipe_id, product_id, ingredient_weight }
// Joined query also returns: product_name, calories, protein, fat, carbs
```

---

## Key Architecture Decisions

### SQLite (expo-sqlite v16)
- **`SQLiteProvider`** wraps the entire app in `app/_layout.tsx`
- **`useSQLiteContext()`** is called in `DbBridge` component and passed via `DbContext`
- All screens call `useDb()` to get the db instance
- All repository functions accept `db` as first parameter
- ⚠️ Do NOT use `SQLite.openDatabaseSync()` at module level — this crashes in SDK 54

### Database initialization
`initDatabase(db)` in `src/db/database.ts` runs `CREATE TABLE IF NOT EXISTS` for all 3 tables. It's passed to `SQLiteProvider` as the `onInit` callback with `useSuspense` enabled.

### Routing
- `app/(tabs)/index.tsx` → Products tab
- `app/(tabs)/recipes.tsx` → Recipes tab
- `app/add-product.tsx` → pushed from Products FAB
- `app/scanner.tsx` → pushed from Add Product screen
- `app/recipe/[id].tsx` → pushed from Recipes list

---

## Implemented Features

- ✅ **Products list** with search
- ✅ **Add Product** form (name + macros per 100g) with live preview card
- ✅ **Recipe list** with create dialog
- ✅ **Recipe Builder** — add ingredients by searching products, input weight, shows total macros
- ✅ **Macro calculation** — `calculateMacros(product, weightGrams)` scales from per-100g values
- ✅ **MacroCard** component — color-coded cal/protein/fat/carbs display
- ✅ **SQLite persistence** — all data survives app restarts
- ⏳ **OCR Scanner** — camera opens, capture works, but OCR parsing is a placeholder

---

## OCR — Next Step

The scanner screen (`app/scanner.tsx`) opens the camera and captures a photo but does NOT yet perform real OCR. The next implementation step is:

1. Install `react-native-vision-camera` + `vision-camera-plugin-frame-processor`
2. Add ML Kit text recognition
3. Pass recognized text through `parseMacrosFromText()` regex (already written in `scanner.tsx`)
4. Auto-fill the Add Product form with parsed values

---

## How to Run (Development)

### Prerequisites
- Node.js v20+ installed
- **Expo Go** app installed on iPhone (App Store)
- iPhone and PC on the **same Wi-Fi network**
- Windows Firewall rule allowing port 8081 inbound:
  ```
  netsh advfirewall firewall add rule name="Expo" dir=in action=allow protocol=TCP localport=8081
  ```
  *(run in Command Prompt as Administrator)*

### Start
```bash
cd C:\Work\M\eat-and-fit
npx expo start
```

Scan the QR code shown in the terminal with your iPhone Camera app. It will open in Expo Go.

### If connection times out (router AP isolation)
Use tunnel mode:
```bash
npx expo start --tunnel
```
This uses ngrok to bypass local network restrictions. Requires internet access.

---

## Known Issues / Gotchas

| Issue | Status | Notes |
|-------|--------|-------|
| OCR not implemented | ⏳ Pending | Placeholder in scanner.tsx |
| react@19.2.x causes renderer mismatch | ✅ Fixed | Pinned to react@19.1.0 |
| expo-sqlite module-level init crashes | ✅ Fixed | Now uses SQLiteProvider |
| Missing assets crash Metro | ✅ Fixed | assets/ folder populated |
| Router AP isolation | ⚠️ Env issue | Use `--tunnel` if needed |

---

## Dependencies (key)

```json
"expo": "^54.0.0",
"expo-router": "~6.0.23",
"expo-sqlite": "~16.0.10",
"expo-camera": "~17.0.10",
"react-native-paper": "^5.12.3",
"react": "19.1.0",
"react-native": "^0.81.5"
```
