import * as SQLite from 'expo-sqlite';
import { Product } from '../models/Product';
import { Recipe, RecipeIngredient } from '../models/Recipe';

export interface BackupData {
  version: number;
  exportedAt: string;
  products: Omit<Product, 'id' | 'created_at'>[];
  recipes: {
    name: string;
    ingredients: { product_name: string; weight: number }[];
  }[];
  dailyMeals?: {
    date: string;
    product_name: string;
    weight: number;
  }[];
}

export const backupRepository = {
  async export(db: SQLite.SQLiteDatabase): Promise<BackupData> {
    const products = await db.getAllAsync<Product>('SELECT * FROM products ORDER BY name ASC');
    const recipes = await db.getAllAsync<Recipe>('SELECT * FROM recipes ORDER BY name ASC');

    const recipesWithIngredients = await Promise.all(
      recipes.map(async (recipe) => {
        const ingredients = await db.getAllAsync<RecipeIngredient & { product_name: string }>(
          `SELECT ri.ingredient_weight as weight, p.name as product_name
           FROM recipe_ingredients ri
           JOIN products p ON ri.product_id = p.id
           WHERE ri.recipe_id = ?`,
          [recipe.id!]
        );
        return {
          name: recipe.name,
          ingredients: ingredients.map((i) => ({ product_name: i.product_name, weight: i.ingredient_weight })),
        };
      })
    );

    // Export daily meals that have data
    const dailyMeals = await db.getAllAsync<{ date: string; product_name: string; weight: number }>(
      `SELECT dm.date, p.name as product_name, dm.weight
       FROM daily_meals dm
       JOIN products p ON dm.product_id = p.id
       ORDER BY dm.date ASC, dm.id ASC`
    );

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      products: products.map(({ id, created_at, ...rest }) => rest),
      recipes: recipesWithIngredients,
      dailyMeals,
    };
  },

  async import(db: SQLite.SQLiteDatabase, data: BackupData): Promise<{ products: number; recipes: number; dailyMeals: number }> {
    let importedProducts = 0;
    let importedRecipes = 0;
    let importedDailyMeals = 0;

    for (const product of data.products) {
      const existing = await db.getFirstAsync<Product>(
        'SELECT id FROM products WHERE name = ?', [product.name]
      );
      if (!existing) {
        await db.runAsync(
          'INSERT INTO products (name, calories, protein, fat, carbs) VALUES (?, ?, ?, ?, ?)',
          [product.name, product.calories, product.protein, product.fat, product.carbs]
        );
        importedProducts++;
      }
    }

    for (const recipe of data.recipes) {
      const existing = await db.getFirstAsync<Recipe>(
        'SELECT id FROM recipes WHERE name = ?', [recipe.name]
      );
      if (existing) continue;

      const result = await db.runAsync('INSERT INTO recipes (name) VALUES (?)', [recipe.name]);
      const recipeId = result.lastInsertRowId;
      importedRecipes++;

      for (const ing of recipe.ingredients) {
        const product = await db.getFirstAsync<Product>(
          'SELECT id FROM products WHERE name = ?', [ing.product_name]
        );
        if (product) {
          await db.runAsync(
            'INSERT INTO recipe_ingredients (recipe_id, product_id, ingredient_weight) VALUES (?, ?, ?)',
            [recipeId, product.id!, ing.weight]
          );
        }
      }
    }

    // Import daily meals
    if (data.dailyMeals && data.dailyMeals.length > 0) {
      for (const meal of data.dailyMeals) {
        const product = await db.getFirstAsync<Product>(
          'SELECT id FROM products WHERE name = ?', [meal.product_name]
        );
        if (!product) continue;
        // Check if this exact meal already exists (same date, product, weight)
        const existing = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM daily_meals WHERE date = ? AND product_id = ? AND weight = ?',
          [meal.date, product.id!, meal.weight]
        );
        if (!existing) {
          await db.runAsync(
            'INSERT INTO daily_meals (date, product_id, weight) VALUES (?, ?, ?)',
            [meal.date, product.id!, meal.weight]
          );
          importedDailyMeals++;
        }
      }
    }

    return { products: importedProducts, recipes: importedRecipes, dailyMeals: importedDailyMeals };
  },
};
