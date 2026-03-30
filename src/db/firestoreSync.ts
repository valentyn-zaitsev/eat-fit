import {
  collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch,
  QuerySnapshot, DocumentData,
} from 'firebase/firestore';
import { firestore } from '../firebase';
import * as SQLite from 'expo-sqlite';
import { Product } from '../models/Product';
import { Recipe, RecipeIngredient } from '../models/Recipe';

// Key for storing the room code
const ROOM_KEY = 'eatandfit_room';

export function getRoomCode(): string | null {
  try {
    return localStorage.getItem(ROOM_KEY);
  } catch {
    return null;
  }
}

export function setRoomCode(code: string) {
  localStorage.setItem(ROOM_KEY, code);
}

export function clearRoomCode() {
  localStorage.removeItem(ROOM_KEY);
}

// ------- Firestore document shapes -------
interface FirestoreProduct {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  updatedAt: number; // timestamp ms
}

interface FirestoreRecipe {
  name: string;
  ingredients: {
    productName: string;
    weight: number;
    sortOrder: number;
  }[];
  updatedAt: number;
}

// ------- Push local DB → Firestore -------
export async function pushLocalToCloud(db: SQLite.SQLiteDatabase, roomCode: string): Promise<{ products: number; recipes: number }> {
  const now = Date.now();

  // Push products
  const products = await db.getAllAsync<Product>('SELECT * FROM products ORDER BY name ASC');
  let pushedProducts = 0;
  for (const p of products) {
    if (p.name.startsWith('🍽')) continue; // skip recipe-meal products
    const docRef = doc(firestore, 'rooms', roomCode, 'products', p.name);
    await setDoc(docRef, {
      name: p.name,
      calories: p.calories,
      protein: p.protein,
      fat: p.fat,
      carbs: p.carbs,
      updatedAt: now,
    } as FirestoreProduct);
    pushedProducts++;
  }

  // Push recipes
  const recipes = await db.getAllAsync<Recipe>('SELECT * FROM recipes ORDER BY name ASC');
  let pushedRecipes = 0;
  for (const r of recipes) {
    const ings = await db.getAllAsync<RecipeIngredient & { product_name: string }>(
      `SELECT ri.*, p.name as product_name FROM recipe_ingredients ri
       JOIN products p ON ri.product_id = p.id
       WHERE ri.recipe_id = ? ORDER BY ri.sort_order ASC, ri.id ASC`,
      [r.id!]
    );
    const docRef = doc(firestore, 'rooms', roomCode, 'recipes', r.name);
    await setDoc(docRef, {
      name: r.name,
      ingredients: ings.map((i, idx) => ({
        productName: i.product_name,
        weight: i.ingredient_weight,
        sortOrder: i.sort_order ?? idx,
      })),
      updatedAt: now,
    } as FirestoreRecipe);
    pushedRecipes++;
  }

  return { products: pushedProducts, recipes: pushedRecipes };
}

// ------- Real-time listeners -------
type Unsubscribe = () => void;

export function startSync(db: SQLite.SQLiteDatabase, roomCode: string): Unsubscribe {
  const unsubProducts = listenProducts(db, roomCode);
  const unsubRecipes = listenRecipes(db, roomCode);
  return () => {
    unsubProducts();
    unsubRecipes();
  };
}

function listenProducts(db: SQLite.SQLiteDatabase, roomCode: string): Unsubscribe {
  const colRef = collection(firestore, 'rooms', roomCode, 'products');
  return onSnapshot(colRef, async (snapshot: QuerySnapshot<DocumentData>) => {
    for (const change of snapshot.docChanges()) {
      const data = change.doc.data() as FirestoreProduct;
      const name = data.name;

      if (change.type === 'added' || change.type === 'modified') {
        const existing = await db.getFirstAsync<Product>(
          'SELECT * FROM products WHERE name = ?', [name]
        );
        if (existing) {
          await db.runAsync(
            'UPDATE products SET calories=?, protein=?, fat=?, carbs=? WHERE id=?',
            [data.calories, data.protein, data.fat, data.carbs, existing.id!]
          );
        } else {
          await db.runAsync(
            'INSERT INTO products (name, calories, protein, fat, carbs) VALUES (?, ?, ?, ?, ?)',
            [name, data.calories, data.protein, data.fat, data.carbs]
          );
        }
      } else if (change.type === 'removed') {
        await db.runAsync('DELETE FROM products WHERE name = ?', [name]);
      }
    }
    // Notify listeners by dispatching a custom event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('firestore-sync'));
    }
  });
}

function listenRecipes(db: SQLite.SQLiteDatabase, roomCode: string): Unsubscribe {
  const colRef = collection(firestore, 'rooms', roomCode, 'recipes');
  return onSnapshot(colRef, async (snapshot: QuerySnapshot<DocumentData>) => {
    for (const change of snapshot.docChanges()) {
      const data = change.doc.data() as FirestoreRecipe;
      const name = data.name;

      if (change.type === 'added' || change.type === 'modified') {
        let existing = await db.getFirstAsync<Recipe>(
          'SELECT * FROM recipes WHERE name = ?', [name]
        );
        let recipeId: number;
        if (existing) {
          recipeId = existing.id!;
          // Remove old ingredients and re-insert
          await db.runAsync('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [recipeId]);
        } else {
          const result = await db.runAsync('INSERT INTO recipes (name) VALUES (?)', [name]);
          recipeId = result.lastInsertRowId;
        }
        // Insert ingredients
        for (const ing of data.ingredients) {
          // Ensure the product exists locally
          let product = await db.getFirstAsync<Product>(
            'SELECT * FROM products WHERE name = ?', [ing.productName]
          );
          if (!product) {
            // Create a placeholder product (will be synced with real data from products collection)
            await db.runAsync(
              'INSERT INTO products (name, calories, protein, fat, carbs) VALUES (?, 0, 0, 0, 0)',
              [ing.productName]
            );
            product = await db.getFirstAsync<Product>('SELECT * FROM products WHERE name = ?', [ing.productName]);
          }
          if (product) {
            await db.runAsync(
              'INSERT INTO recipe_ingredients (recipe_id, product_id, ingredient_weight, sort_order) VALUES (?, ?, ?, ?)',
              [recipeId, product.id!, ing.weight, ing.sortOrder]
            );
          }
        }
      } else if (change.type === 'removed') {
        const existing = await db.getFirstAsync<Recipe>('SELECT * FROM recipes WHERE name = ?', [name]);
        if (existing) {
          await db.runAsync('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [existing.id!]);
          await db.runAsync('DELETE FROM recipes WHERE id = ?', [existing.id!]);
        }
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('firestore-sync'));
    }
  });
}

// ------- Push a single product change to Firestore -------
export async function syncProductToCloud(product: Omit<Product, 'id' | 'created_at'>) {
  const room = getRoomCode();
  if (!room || product.name.startsWith('🍽')) return;
  const docRef = doc(firestore, 'rooms', room, 'products', product.name);
  await setDoc(docRef, {
    name: product.name,
    calories: product.calories,
    protein: product.protein,
    fat: product.fat,
    carbs: product.carbs,
    updatedAt: Date.now(),
  } as FirestoreProduct);
}

export async function deleteProductFromCloud(name: string) {
  const room = getRoomCode();
  if (!room || name.startsWith('🍽')) return;
  const docRef = doc(firestore, 'rooms', room, 'products', name);
  await deleteDoc(docRef);
}

// ------- Push a single recipe change to Firestore -------
export async function syncRecipeToCloud(db: SQLite.SQLiteDatabase, recipeId: number) {
  const room = getRoomCode();
  if (!room) return;
  const recipe = await db.getFirstAsync<Recipe>('SELECT * FROM recipes WHERE id = ?', [recipeId]);
  if (!recipe) return;
  const ings = await db.getAllAsync<RecipeIngredient & { product_name: string }>(
    `SELECT ri.*, p.name as product_name FROM recipe_ingredients ri
     JOIN products p ON ri.product_id = p.id
     WHERE ri.recipe_id = ? ORDER BY ri.sort_order ASC, ri.id ASC`,
    [recipeId]
  );
  const docRef = doc(firestore, 'rooms', room, 'recipes', recipe.name);
  await setDoc(docRef, {
    name: recipe.name,
    ingredients: ings.map((i, idx) => ({
      productName: i.product_name,
      weight: i.ingredient_weight,
      sortOrder: i.sort_order ?? idx,
    })),
    updatedAt: Date.now(),
  } as FirestoreRecipe);
}

export async function deleteRecipeFromCloud(name: string) {
  const room = getRoomCode();
  if (!room) return;
  const docRef = doc(firestore, 'rooms', room, 'recipes', name);
  await deleteDoc(docRef);
}
