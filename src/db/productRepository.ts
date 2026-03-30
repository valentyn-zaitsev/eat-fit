import * as SQLite from 'expo-sqlite';
import { Product } from '../models/Product';

export const productRepository = {
  async getAll(db: SQLite.SQLiteDatabase): Promise<Product[]> {
    return await db.getAllAsync<Product>('SELECT * FROM products ORDER BY name ASC');
  },

  async search(db: SQLite.SQLiteDatabase, query: string): Promise<Product[]> {
    return await db.getAllAsync<Product>(
      'SELECT * FROM products WHERE name LIKE ? ORDER BY name ASC',
      [`%${query}%`]
    );
  },

  async getById(db: SQLite.SQLiteDatabase, id: number): Promise<Product | null> {
    return await db.getFirstAsync<Product>('SELECT * FROM products WHERE id = ?', [id]);
  },

  async create(db: SQLite.SQLiteDatabase, product: Omit<Product, 'id' | 'created_at'>): Promise<number> {
    const result = await db.runAsync(
      'INSERT INTO products (name, calories, protein, fat, carbs) VALUES (?, ?, ?, ?, ?)',
      [product.name, product.calories, product.protein, product.fat, product.carbs]
    );
    return result.lastInsertRowId;
  },

  async update(db: SQLite.SQLiteDatabase, id: number, product: Omit<Product, 'id' | 'created_at'>): Promise<void> {
    await db.runAsync(
      'UPDATE products SET name=?, calories=?, protein=?, fat=?, carbs=? WHERE id=?',
      [product.name, product.calories, product.protein, product.fat, product.carbs, id]
    );
  },

  async delete(db: SQLite.SQLiteDatabase, id: number): Promise<void> {
    await db.runAsync('DELETE FROM products WHERE id = ?', [id]);
  },
};
