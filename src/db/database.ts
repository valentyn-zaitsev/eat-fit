import * as SQLite from 'expo-sqlite';

export const initDatabase = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      calories REAL NOT NULL,
      protein REAL NOT NULL,
      fat REAL NOT NULL,
      carbs REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      ingredient_weight REAL NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS daily_meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      weight REAL NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  // Migration: add recipe_data column to daily_meals
  const dmCols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(daily_meals)`);
  if (!dmCols.find((c) => c.name === 'recipe_data')) {
    await db.execAsync(`ALTER TABLE daily_meals ADD COLUMN recipe_data TEXT`);
  }

  // Migration: add sort_order column
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(recipe_ingredients)`);
  if (!cols.find((c) => c.name === 'sort_order')) {
    await db.execAsync(`ALTER TABLE recipe_ingredients ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
    // Backfill existing rows with sort_order based on id order
    await db.execAsync(`
      UPDATE recipe_ingredients SET sort_order = (
        SELECT COUNT(*) FROM recipe_ingredients ri2
        WHERE ri2.recipe_id = recipe_ingredients.recipe_id AND ri2.id <= recipe_ingredients.id
      ) - 1
    `);
  }
};
