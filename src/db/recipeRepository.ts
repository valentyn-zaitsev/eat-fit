import * as SQLite from 'expo-sqlite';
import { Recipe, RecipeIngredient } from '../models/Recipe';
import { MacroResult } from '../models/Product';

export interface RecipeWithMacros extends Recipe {
  totalWeight: number;
  totalMacros: MacroResult;
  per100gMacros: MacroResult;
}

export const recipeRepository = {
  async getAll(db: SQLite.SQLiteDatabase): Promise<Recipe[]> {
    return await db.getAllAsync<Recipe>('SELECT * FROM recipes ORDER BY name ASC');
  },

  async getById(db: SQLite.SQLiteDatabase, id: number): Promise<Recipe | null> {
    return await db.getFirstAsync<Recipe>('SELECT * FROM recipes WHERE id = ?', [id]);
  },

  async getByName(db: SQLite.SQLiteDatabase, name: string): Promise<Recipe | null> {
    return await db.getFirstAsync<Recipe>('SELECT * FROM recipes WHERE name = ?', [name]);
  },

  async create(db: SQLite.SQLiteDatabase, name: string): Promise<number> {
    const result = await db.runAsync('INSERT INTO recipes (name) VALUES (?)', [name]);
    return result.lastInsertRowId;
  },

  async update(db: SQLite.SQLiteDatabase, id: number, name: string): Promise<void> {
    await db.runAsync('UPDATE recipes SET name = ? WHERE id = ?', [name, id]);
  },

  async delete(db: SQLite.SQLiteDatabase, id: number): Promise<void> {
    await db.runAsync('DELETE FROM recipes WHERE id = ?', [id]);
  },

  async getIngredients(db: SQLite.SQLiteDatabase, recipeId: number): Promise<RecipeIngredient[]> {
    return await db.getAllAsync<RecipeIngredient>(
      `SELECT ri.*, p.name as product_name, p.calories, p.protein, p.fat, p.carbs
       FROM recipe_ingredients ri
       JOIN products p ON ri.product_id = p.id
       WHERE ri.recipe_id = ?
       ORDER BY ri.sort_order ASC, ri.id ASC`,
      [recipeId]
    );
  },

  async addIngredient(db: SQLite.SQLiteDatabase, recipeId: number, productId: number, weight: number): Promise<number> {
    const maxRow = await db.getFirstAsync<{ mx: number | null }>(
      'SELECT MAX(sort_order) as mx FROM recipe_ingredients WHERE recipe_id = ?', [recipeId]
    );
    const nextOrder = (maxRow?.mx ?? -1) + 1;
    const result = await db.runAsync(
      'INSERT INTO recipe_ingredients (recipe_id, product_id, ingredient_weight, sort_order) VALUES (?, ?, ?, ?)',
      [recipeId, productId, weight, nextOrder]
    );
    return result.lastInsertRowId;
  },

  async updateIngredientWeight(db: SQLite.SQLiteDatabase, ingredientId: number, weight: number): Promise<void> {
    await db.runAsync('UPDATE recipe_ingredients SET ingredient_weight = ? WHERE id = ?', [weight, ingredientId]);
  },

  async removeIngredient(db: SQLite.SQLiteDatabase, ingredientId: number): Promise<void> {
    await db.runAsync('DELETE FROM recipe_ingredients WHERE id = ?', [ingredientId]);
  },

  async swapIngredientOrder(db: SQLite.SQLiteDatabase, idA: number, orderA: number, idB: number, orderB: number): Promise<void> {
    await db.runAsync('UPDATE recipe_ingredients SET sort_order = ? WHERE id = ?', [orderB, idA]);
    await db.runAsync('UPDATE recipe_ingredients SET sort_order = ? WHERE id = ?', [orderA, idB]);
  },

  async getRecipeWithMacros(db: SQLite.SQLiteDatabase, recipeId: number): Promise<RecipeWithMacros | null> {
    const recipe = await this.getById(db, recipeId);
    if (!recipe) return null;
    const ings = await this.getIngredients(db, recipeId);
    const totalWeight = ings.reduce((sum, i) => sum + i.ingredient_weight, 0);
    const totalMacros: MacroResult = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    for (const ing of ings) {
      const f = ing.ingredient_weight / 100;
      totalMacros.calories += (ing.calories ?? 0) * f;
      totalMacros.protein += (ing.protein ?? 0) * f;
      totalMacros.fat += (ing.fat ?? 0) * f;
      totalMacros.carbs += (ing.carbs ?? 0) * f;
    }
    const round1 = (v: number) => Math.round(v * 10) / 10;
    const per100g = totalWeight > 0
      ? {
          calories: round1(totalMacros.calories / totalWeight * 100),
          protein: round1(totalMacros.protein / totalWeight * 100),
          fat: round1(totalMacros.fat / totalWeight * 100),
          carbs: round1(totalMacros.carbs / totalWeight * 100),
        }
      : { calories: 0, protein: 0, fat: 0, carbs: 0 };
    return {
      ...recipe,
      totalWeight: round1(totalWeight),
      totalMacros: {
        calories: round1(totalMacros.calories),
        protein: round1(totalMacros.protein),
        fat: round1(totalMacros.fat),
        carbs: round1(totalMacros.carbs),
      },
      per100gMacros: per100g,
    };
  },

  async getAllWithMacros(db: SQLite.SQLiteDatabase): Promise<RecipeWithMacros[]> {
    const recipes = await this.getAll(db);
    const results: RecipeWithMacros[] = [];
    for (const recipe of recipes) {
      const r = await this.getRecipeWithMacros(db, recipe.id!);
      if (r) results.push(r);
    }
    return results;
  },
};
