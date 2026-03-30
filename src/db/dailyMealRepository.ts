import * as SQLite from 'expo-sqlite';
import { Product } from '../models/Product';

export interface DailyMeal {
  id?: number;
  date: string;
  product_id: number;
  weight: number;
  recipe_data?: string | null;
  product_name?: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
}

export const dailyMealRepository = {
  async getByDate(db: SQLite.SQLiteDatabase, date: string): Promise<DailyMeal[]> {
    return await db.getAllAsync<DailyMeal>(
      `SELECT dm.*, p.name as product_name, p.calories, p.protein, p.fat, p.carbs
       FROM daily_meals dm
       JOIN products p ON dm.product_id = p.id
       WHERE dm.date = ?
       ORDER BY dm.id ASC`,
      [date]
    );
  },

  async add(db: SQLite.SQLiteDatabase, date: string, productId: number, weight: number, recipeData?: string | null): Promise<number> {
    const result = await db.runAsync(
      'INSERT INTO daily_meals (date, product_id, weight, recipe_data) VALUES (?, ?, ?, ?)',
      [date, productId, weight, recipeData ?? null]
    );
    return result.lastInsertRowId;
  },

  async remove(db: SQLite.SQLiteDatabase, id: number): Promise<void> {
    await db.runAsync('DELETE FROM daily_meals WHERE id = ?', [id]);
  },

  async updateWeight(db: SQLite.SQLiteDatabase, id: number, weight: number): Promise<void> {
    await db.runAsync('UPDATE daily_meals SET weight = ? WHERE id = ?', [weight, id]);
  },

  async updateMeal(db: SQLite.SQLiteDatabase, id: number, productId: number, weight: number, recipeData?: string | null): Promise<void> {
    await db.runAsync('UPDATE daily_meals SET product_id = ?, weight = ?, recipe_data = ? WHERE id = ?', [productId, weight, recipeData ?? null, id]);
  },

  async getDates(db: SQLite.SQLiteDatabase): Promise<string[]> {
    const rows = await db.getAllAsync<{ date: string }>(
      'SELECT DISTINCT date FROM daily_meals ORDER BY date DESC'
    );
    return rows.map((r) => r.date);
  },
};
