import React, { useState, useCallback, useEffect } from 'react';
import { View, FlatList, StyleSheet, Alert, ScrollView, Platform, TextInput as NativeTextInput } from 'react-native';
import Slider from '@react-native-community/slider';
import { Text, Divider, IconButton, FAB, Dialog, Portal, TextInput, Button, List, Checkbox } from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { dailyMealRepository, DailyMeal } from '../../src/db/dailyMealRepository';
import { productRepository } from '../../src/db/productRepository';
import { recipeRepository, RecipeWithMacros } from '../../src/db/recipeRepository';
import { useDb } from '../../src/db/DbContext';
import { MacroCard } from '../../src/components/MacroCard';
import { calculateMacros, sumMacros, MacroResult } from '../../src/models/Product';
import { Product } from '../../src/models/Product';
import { RecipeIngredient } from '../../src/models/Recipe';
import { syncProductToCloud } from '../../src/db/firestoreSync';

function dateToString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayString(): string {
  return dateToString(new Date());
}

function prevDay(date: string): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return dateToString(d);
}

function nextDay(date: string): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return dateToString(d);
}

function formatDate(date: string): string {
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

const n = (s: string) => Number(s.replace(',', '.'));

interface DailyTargets {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

const DEFAULT_TARGETS: DailyTargets = { calories: 2000, protein: 150, fat: 56, carbs: 225 };

function loadTargets(): DailyTargets | null {
  try {
    const stored = Platform.OS === 'web' ? localStorage.getItem('dailyTargets') : null;
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

function saveTargets(t: DailyTargets) {
  if (Platform.OS === 'web') localStorage.setItem('dailyTargets', JSON.stringify(t));
}

// Recalculate carbs from remaining calories
function recalcCarbs(cal: number, protein: number, fat: number): number {
  const remaining = cal - protein * 4 - fat * 9;
  return Math.max(0, Math.round(remaining / 4));
}

// Auto-distribute macros from calorie target (30/25/45 split)
function autoDistribute(cal: number): DailyTargets {
  const protein = Math.round(cal * 0.30 / 4);
  const fat = Math.round(cal * 0.25 / 9);
  const carbs = recalcCarbs(cal, protein, fat);
  return { calories: cal, protein, fat, carbs };
}

export default function DailyScreen() {
  const db = useDb();
  const [currentDate, setCurrentDate] = useState(todayString());
  const [meals, setMeals] = useState<DailyMeal[]>([]);
  const [totalMacros, setTotalMacros] = useState<MacroResult>({ calories: 0, protein: 0, fat: 0, carbs: 0 });

  const [addVisible, setAddVisible] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allRecipes, setAllRecipes] = useState<RecipeWithMacros[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeWithMacros | null>(null);
  const [recipeIngredients, setRecipeIngredients] = useState<(RecipeIngredient & { editWeight: string })[]>([]);
  const [updateRecipe, setUpdateRecipe] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  // "New product" mode
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCalories, setNewCalories] = useState('');
  const [newProtein, setNewProtein] = useState('');
  const [newFat, setNewFat] = useState('');
  const [newCarbs, setNewCarbs] = useState('');
  const [saveToProducts, setSaveToProducts] = useState(true);
  const [portionPct, setPortionPct] = useState(100);

  // Edit meal dialog - single state object to avoid race conditions
  interface EditState {
    meal: DailyMeal;
    weight: string;
    isRecipe: boolean;
    recipeId: number | null;
    ingredients: (RecipeIngredient & { editWeight: string })[];
    updateRecipe: boolean;
  }
  const [editState, setEditState] = useState<EditState | null>(null);

  // Targets
  const [targets, setTargets] = useState<DailyTargets | null>(null);
  const [targetDialogVisible, setTargetDialogVisible] = useState(false);
  const [tCal, setTCal] = useState('');
  const [tProtein, setTProtein] = useState('');
  const [tFat, setTFat] = useState('');
  const [tCarbs, setTCarbs] = useState('');

  useEffect(() => {
    const saved = loadTargets();
    if (saved) setTargets(saved);
  }, []);

  const openTargetDialog = () => {
    const t = targets || DEFAULT_TARGETS;
    setTCal(String(t.calories));
    setTProtein(String(t.protein));
    setTFat(String(t.fat));
    setTCarbs(String(t.carbs));
    setTargetDialogVisible(true);
  };

  const handleCaloriesChange = (v: string) => {
    setTCal(v);
    const cal = n(v);
    if (!isNaN(cal) && cal > 0) {
      const d = autoDistribute(cal);
      setTProtein(String(d.protein));
      setTFat(String(d.fat));
      setTCarbs(String(d.carbs));
    }
  };

  const handleProteinChange = (v: string) => {
    setTProtein(v);
    const cal = n(tCal), p = n(v), f = n(tFat);
    if (!isNaN(cal) && !isNaN(p) && !isNaN(f)) setTCarbs(String(recalcCarbs(cal, p, f)));
  };

  const handleFatChange = (v: string) => {
    setTFat(v);
    const cal = n(tCal), p = n(tProtein), f = n(v);
    if (!isNaN(cal) && !isNaN(p) && !isNaN(f)) setTCarbs(String(recalcCarbs(cal, p, f)));
  };

  const saveTargetSettings = () => {
    const t: DailyTargets = { calories: n(tCal) || 0, protein: n(tProtein) || 0, fat: n(tFat) || 0, carbs: n(tCarbs) || 0 };
    setTargets(t);
    saveTargets(t);
    setTargetDialogVisible(false);
  };

  const clearTargets = () => {
    setTargets(null);
    if (Platform.OS === 'web') localStorage.removeItem('dailyTargets');
    setTargetDialogVisible(false);
  };

  const loadMeals = useCallback(async () => {
    const data = await dailyMealRepository.getByDate(db, currentDate);
    setMeals(data);
    const macros = data.map((m) =>
      calculateMacros(
        { name: m.product_name!, calories: m.calories!, protein: m.protein!, fat: m.fat!, carbs: m.carbs! },
        m.weight
      )
    );
    setTotalMacros(sumMacros(macros));
  }, [db, currentDate]);

  useFocusEffect(useCallback(() => { loadMeals(); }, [loadMeals]));

  const openAddDialog = async () => {
    const [products, recipes] = await Promise.all([
      productRepository.getAll(db),
      recipeRepository.getAllWithMacros(db),
    ]);
    setAllProducts(products.filter((p) => !p.name.startsWith('🍽')));
    setAllRecipes(recipes);
    setAddVisible(true);
  };

  const closeAddDialog = () => {
    setAddVisible(false);
    setSelectedProduct(null);
    setSelectedRecipe(null);
    setRecipeIngredients([]);
    setUpdateRecipe(false);
    setProductSearch('');
    setAllProducts([]);
    setAllRecipes([]);
    setWeightInput('');
    setIsNewProduct(false);
    setNewName(''); setNewCalories(''); setNewProtein(''); setNewFat(''); setNewCarbs('');
    setSaveToProducts(true);
    setPortionPct(100);
  };

  const handleSelectRecipe = async (recipe: RecipeWithMacros) => {
    const ings = await recipeRepository.getIngredients(db, recipe.id!);
    setRecipeIngredients(ings.map((i) => ({ ...i, editWeight: String(i.ingredient_weight) })));
    setSelectedRecipe(recipe);
  };

  const updateIngWeight = (index: number, value: string) => {
    setRecipeIngredients((prev) => prev.map((ing, i) => i === index ? { ...ing, editWeight: value } : ing));
  };

  // Compute live macros from edited recipe ingredients
  const recipeLiveMacros = (): MacroResult => {
    return sumMacros(
      recipeIngredients.map((ing) => {
        const w = n(ing.editWeight) || 0;
        return calculateMacros(
          { name: ing.product_name!, calories: ing.calories!, protein: ing.protein!, fat: ing.fat!, carbs: ing.carbs! },
          w
        );
      })
    );
  };

  const recipeLiveTotalWeight = (): number => {
    return recipeIngredients.reduce((sum, ing) => sum + (n(ing.editWeight) || 0), 0);
  };

  const filteredProducts = productSearch.trim()
    ? allProducts.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()))
    : allProducts;

  const filteredRecipes = productSearch.trim()
    ? allRecipes.filter((r) => r.name.toLowerCase().includes(productSearch.toLowerCase()))
    : allRecipes;

  const handleAdd = async () => {
    const portion = portionPct / 100;
    if (isNewProduct) {
      if (!weightInput || isNaN(n(weightInput))) return;
      if (!newName.trim() || isNaN(n(newCalories)) || isNaN(n(newProtein)) || isNaN(n(newFat)) || isNaN(n(newCarbs))) return;
      const productId = await productRepository.create(db, {
        name: newName.trim(),
        calories: n(newCalories),
        protein: n(newProtein),
        fat: n(newFat),
        carbs: n(newCarbs),
      });
      if (saveToProducts) syncProductToCloud({ name: newName.trim(), calories: n(newCalories), protein: n(newProtein), fat: n(newFat), carbs: n(newCarbs) }).catch(() => {});
      await dailyMealRepository.add(db, currentDate, productId, Math.round(n(weightInput) * portion * 10) / 10);
    } else if (selectedRecipe) {
      // Calculate totals from edited ingredients
      const liveMacros = recipeLiveMacros();
      const liveTotalW = recipeLiveTotalWeight();
      if (liveTotalW <= 0) return;

      // Per-100g macros from the edited ingredients
      const r1 = (v: number) => Math.round(v / liveTotalW * 100 * 10) / 10;
      const per100g = {
        calories: r1(liveMacros.calories),
        protein: r1(liveMacros.protein),
        fat: r1(liveMacros.fat),
        carbs: r1(liveMacros.carbs),
      };

      // Always create a new snapshot product so past daily meals keep their original macros
      const recipeProdName = `🍽 ${selectedRecipe.name}`;
      const productId = await productRepository.create(db, { name: recipeProdName, ...per100g });

      // Store ingredient weights as JSON for accurate re-editing (scaled by portion)
      const recipeDataJson = JSON.stringify(recipeIngredients.map((ing) => ({
        product_id: ing.product_id,
        product_name: ing.product_name,
        weight: Math.round((n(ing.editWeight) || 0) * portion * 10) / 10,
        calories: ing.calories,
        protein: ing.protein,
        fat: ing.fat,
        carbs: ing.carbs,
      })));

      // Add as ONE meal entry with total weight (applying portion)
      await dailyMealRepository.add(db, currentDate, productId, Math.round(liveTotalW * portion * 10) / 10, recipeDataJson);

      // Optionally update the recipe with new weights
      if (updateRecipe) {
        for (const ing of recipeIngredients) {
          const w = n(ing.editWeight) || 0;
          await recipeRepository.updateIngredientWeight(db, ing.id!, w);
        }
      }
    } else {
      if (!selectedProduct || !weightInput || isNaN(n(weightInput))) return;
      await dailyMealRepository.add(db, currentDate, selectedProduct.id!, Math.round(n(weightInput) * portion * 10) / 10);
    }
    closeAddDialog();
    loadMeals();
  };

  const handleRemove = (meal: DailyMeal) => {
    if (Platform.OS === 'web') {
      if (confirm(`Remove ${meal.product_name} (${meal.weight}g)?`)) {
        dailyMealRepository.remove(db, meal.id!).then(() => loadMeals());
      }
    } else {
      Alert.alert('Remove meal?', `Remove ${meal.product_name} (${meal.weight}g)?`, [
        { text: 'Cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => { await dailyMealRepository.remove(db, meal.id!); loadMeals(); } },
      ]);
    }
  };

  const openEditMeal = async (meal: DailyMeal) => {
    // Check if this is a recipe meal (🍽 prefix)
    if (meal.product_name?.startsWith('🍽')) {
      // Try to use stored ingredient data first (exact weights from last save)
      if (meal.recipe_data) {
        try {
          const stored = JSON.parse(meal.recipe_data) as { product_id: number; product_name: string; weight: number; calories: number; protein: number; fat: number; carbs: number }[];
          const recipeName = meal.product_name!.replace(/^🍽\s*/, '').trim();
          const recipe = await recipeRepository.getByName(db, recipeName);
          setEditState({
            meal,
            weight: String(meal.weight),
            isRecipe: true,
            recipeId: recipe?.id ?? null,
            ingredients: stored.map((s, idx) => ({
              id: idx,
              recipe_id: 0,
              product_id: s.product_id,
              ingredient_weight: s.weight,
              product_name: s.product_name,
              calories: s.calories,
              protein: s.protein,
              fat: s.fat,
              carbs: s.carbs,
              editWeight: String(s.weight),
              sort_order: idx,
            })),
            updateRecipe: false,
          });
          return;
        } catch (e) {
          // fallback to recipe-based lookup
        }
      }
      // Fallback: reconstruct from recipe (for old meals without recipe_data)
      const recipeName = meal.product_name!.replace(/^🍽\s*/, '').trim();
      try {
        const recipe = await recipeRepository.getByName(db, recipeName);
        if (recipe) {
          const ings = await recipeRepository.getIngredients(db, recipe.id!);
          if (ings.length > 0) {
            const recipeTotal = ings.reduce((s, i) => s + i.ingredient_weight, 0);
            const ratio = recipeTotal > 0 ? meal.weight / recipeTotal : 1;
            setEditState({
              meal,
              weight: String(meal.weight),
              isRecipe: true,
              recipeId: recipe.id!,
              ingredients: ings.map((i) => ({
                ...i,
                editWeight: String(Math.round(i.ingredient_weight * ratio * 10) / 10),
              })),
              updateRecipe: false,
            });
            return;
          }
        }
      } catch (e) {
        // fallback to simple editor
      }
    }
    setEditState({
      meal,
      weight: String(meal.weight),
      isRecipe: false,
      recipeId: null,
      ingredients: [],
      updateRecipe: false,
    });
  };

  const editIngLiveMacros = (): MacroResult => {
    if (!editState) return { calories: 0, protein: 0, fat: 0, carbs: 0 };
    return sumMacros(
      editState.ingredients.map((ing) => {
        const w = n(ing.editWeight) || 0;
        return calculateMacros(
          { name: ing.product_name!, calories: ing.calories!, protein: ing.protein!, fat: ing.fat!, carbs: ing.carbs! },
          w
        );
      })
    );
  };

  const editIngTotalWeight = (): number => {
    if (!editState) return 0;
    return editState.ingredients.reduce((sum, ing) => sum + (n(ing.editWeight) || 0), 0);
  };

  const updateEditIngWeight = (index: number, value: string) => {
    setEditState((prev) => {
      if (!prev) return prev;
      return { ...prev, ingredients: prev.ingredients.map((ing, i) => i === index ? { ...ing, editWeight: value } : ing) };
    });
  };

  const handleEditSave = async () => {
    if (!editState) return;

    if (editState.ingredients.length > 0) {
      const liveTotalW = editIngTotalWeight();
      if (liveTotalW <= 0) return;
      const liveMacros = editIngLiveMacros();
      const r1 = (v: number) => Math.round(v / liveTotalW * 100 * 10) / 10;
      const per100g = {
        calories: r1(liveMacros.calories),
        protein: r1(liveMacros.protein),
        fat: r1(liveMacros.fat),
        carbs: r1(liveMacros.carbs),
      };
      const recipeProdName = editState.meal.product_name!;
      const newProductId = await productRepository.create(db, { name: recipeProdName, ...per100g });

      // Store ingredient weights as JSON for accurate re-editing
      const recipeDataJson = JSON.stringify(editState.ingredients.map((ing) => ({
        product_id: ing.product_id,
        product_name: ing.product_name,
        weight: n(ing.editWeight) || 0,
        calories: ing.calories,
        protein: ing.protein,
        fat: ing.fat,
        carbs: ing.carbs,
      })));

      await dailyMealRepository.updateMeal(db, editState.meal.id!, newProductId, Math.round(liveTotalW * 10) / 10, recipeDataJson);

      if (editState.updateRecipe && editState.recipeId) {
        for (const ing of editState.ingredients) {
          const w = n(ing.editWeight) || 0;
          await recipeRepository.updateIngredientWeight(db, ing.id!, w);
        }
      }
    } else {
      const w = n(editState.weight);
      if (isNaN(w) || w <= 0) return;
      await dailyMealRepository.updateWeight(db, editState.meal.id!, Math.round(w * 10) / 10);
    }

    setEditState(null);
    loadMeals();
  };

  const handleEditRemove = async () => {
    if (!editState) return;
    if (Platform.OS === 'web') {
      if (!confirm(`Remove ${editState.meal.product_name}?`)) return;
    }
    await dailyMealRepository.remove(db, editState.meal.id!);
    setEditState(null);
    loadMeals();
  };

  const isToday = currentDate === todayString();

  return (
    <View style={styles.container}>
      <View style={styles.dateNav}>
        <IconButton icon="chevron-left" size={20} onPress={() => setCurrentDate(prevDay(currentDate))} style={styles.navBtn} />
        <Text variant="bodyLarge" style={styles.dateText}>
          {isToday ? 'Today' : formatDate(currentDate)}
        </Text>
        <IconButton
          icon="chevron-right"
          size={20}
          onPress={() => setCurrentDate(nextDay(currentDate))}
          disabled={isToday}
          style={styles.navBtn}
        />
        <IconButton icon="target" size={20} onPress={openTargetDialog} style={styles.navBtn} />
      </View>

      {targets ? (
        <View style={styles.targetCard}>
          {([
            { label: 'Calories', eaten: totalMacros.calories, target: targets.calories, unit: '', color: '#FF6B6B' },
            { label: 'Protein', eaten: totalMacros.protein, target: targets.protein, unit: '', color: '#4ECDC4' },
            { label: 'Fat', eaten: totalMacros.fat, target: targets.fat, unit: '', color: '#FFE66D' },
            { label: 'Carbs', eaten: totalMacros.carbs, target: targets.carbs, unit: '', color: '#A8E6CF' },
          ] as const).map(({ label, eaten, target, unit, color }) => {
            const over = eaten > target;
            const remaining = Math.max(0, target - eaten);
            const pct = target > 0 ? Math.min(eaten / target, 1) : 0;
            const f = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
            return (
              <View key={label} style={styles.targetRow}>
                <Text style={styles.targetLabel}>{label}</Text>
                <View style={styles.targetBarWrap}>
                  <View style={[styles.targetBarBg, { backgroundColor: over ? '#FFCDD2' : '#E8E8E8' }]}>
                    <View style={[styles.targetBarFill, { width: `${pct * 100}%`, backgroundColor: over ? '#E53935' : color }]} />
                  </View>
                  <View style={styles.targetBarOverlay}>
                    <Text style={[styles.barText, { color: over || pct > 0.15 ? '#fff' : '#555' }]}>
                      {f(eaten)}{unit} / {f(target)}
                    </Text>
                    <Text style={[styles.barText, { color: over ? '#fff' : '#777' }]}>
                      {over ? `+${f(eaten - target)}${unit}` : `-${f(remaining)}${unit}`}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <MacroCard macros={totalMacros} label="Total for the day" />
      )}
      <Divider style={styles.divider} />

      <Text variant="titleSmall" style={styles.mealsTitle}>Meals</Text>
      <FlatList
        data={meals}
        keyExtractor={(item) => String(item.id)}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={<Text style={styles.empty}>No meals added yet.</Text>}
        renderItem={({ item }) => {
          const m = calculateMacros(
            { name: item.product_name!, calories: item.calories!, protein: item.protein!, fat: item.fat!, carbs: item.carbs! },
            item.weight
          );
          return (
            <List.Item
              title={`${item.product_name} — ${item.weight}g`}
              description={`Cal: ${m.calories} | P: ${m.protein}g | F: ${m.fat}g | C: ${m.carbs}g`}
              left={(props) => <List.Icon {...props} icon="food" />}
              right={() => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <IconButton icon="pencil" size={20} onPress={() => openEditMeal(item)} />
                  <IconButton icon="delete" size={20} onPress={() => handleRemove(item)} />
                </View>
              )}
              onPress={() => openEditMeal(item)}
            />
          );
        }}
      />

      <Portal>
        <Dialog visible={addVisible} onDismiss={closeAddDialog}>
          <Dialog.Title>Add Meal</Dialog.Title>
          <Dialog.Content>
            {!selectedProduct && !selectedRecipe && !isNewProduct ? (
              <>
                <TextInput
                  label="Filter products & recipes"
                  value={productSearch}
                  onChangeText={setProductSearch}
                  autoFocus
                  left={<TextInput.Icon icon="magnify" />}
                />
                <ScrollView style={{ maxHeight: 300, marginTop: 8 }}>
                  {filteredRecipes.length > 0 && (
                    <>
                      <Text variant="labelMedium" style={{ color: '#66BB6A', fontWeight: '700', marginTop: 4, marginBottom: 2 }}>Recipes</Text>
                      {filteredRecipes.map((r) => (
                        <List.Item
                          key={`r-${r.id}`}
                          title={r.name}
                          description={`${r.totalWeight}g total | Cal: ${r.per100gMacros.calories} P: ${r.per100gMacros.protein}g F: ${r.per100gMacros.fat}g C: ${r.per100gMacros.carbs}g /100g`}
                          left={(props) => <List.Icon {...props} icon="book-open-variant" />}
                          onPress={() => handleSelectRecipe(r)}
                          style={{ paddingVertical: 2 }}
                        />
                      ))}
                    </>
                  )}
                  {filteredProducts.length > 0 && (
                    <>
                      <Text variant="labelMedium" style={{ color: '#555', fontWeight: '700', marginTop: 8, marginBottom: 2 }}>Products</Text>
                      {filteredProducts.map((p) => (
                        <List.Item
                          key={`p-${p.id}`}
                          title={p.name}
                          description={`Cal: ${p.calories} P: ${p.protein}g F: ${p.fat}g C: ${p.carbs}g /100g`}
                          onPress={() => setSelectedProduct(p)}
                          style={{ paddingVertical: 2 }}
                        />
                      ))}
                    </>
                  )}
                  {filteredProducts.length === 0 && filteredRecipes.length === 0 && (
                    <Text style={{ textAlign: 'center', color: '#999', marginTop: 16 }}>Nothing found</Text>
                  )}
                </ScrollView>
                <Divider style={{ marginVertical: 12 }} />
                <Button
                  mode="outlined"
                  icon="plus"
                  onPress={() => setIsNewProduct(true)}
                >
                  Quick Meal (custom macros)
                </Button>
              </>
            ) : isNewProduct ? (
              <ScrollView style={{ maxHeight: 350 }}>
                <TextInput label="Product name" value={newName} onChangeText={setNewName} autoFocus style={{ marginBottom: 8 }} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput label="Calories" value={newCalories} onChangeText={setNewCalories} keyboardType="decimal-pad" style={{ flex: 1 }} />
                  <TextInput label="Protein (g)" value={newProtein} onChangeText={setNewProtein} keyboardType="decimal-pad" style={{ flex: 1 }} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TextInput label="Fat (g)" value={newFat} onChangeText={setNewFat} keyboardType="decimal-pad" style={{ flex: 1 }} />
                  <TextInput label="Carbs (g)" value={newCarbs} onChangeText={setNewCarbs} keyboardType="decimal-pad" style={{ flex: 1 }} />
                </View>
                <TextInput label="Weight (grams)" value={weightInput} onChangeText={setWeightInput} keyboardType="decimal-pad" style={{ marginTop: 8 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                  <Checkbox status={saveToProducts ? 'checked' : 'unchecked'} onPress={() => setSaveToProducts(!saveToProducts)} />
                  <Text onPress={() => setSaveToProducts(!saveToProducts)}>Save to Products list</Text>
                </View>
              </ScrollView>
            ) : selectedRecipe ? (
              <ScrollView style={{ maxHeight: 400 }}>
                <Text variant="titleSmall" style={{ fontWeight: '700', marginBottom: 8 }}>
                  {selectedRecipe.name} — Ingredients
                </Text>
                {recipeIngredients.map((ing, index) => {
                  const w = n(ing.editWeight) || 0;
                  const m = calculateMacros(
                    { name: ing.product_name!, calories: ing.calories!, protein: ing.protein!, fat: ing.fat!, carbs: ing.carbs! },
                    w
                  );
                  return (
                    <View key={ing.id} style={{ marginBottom: 8 }}>
                      <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{ing.product_name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <NativeTextInput
                          value={ing.editWeight}
                          onChangeText={(v) => updateIngWeight(index, v)}
                          keyboardType="decimal-pad"
                          placeholder="g"
                          style={{ width: 60, backgroundColor: '#fff', textAlign: 'center', fontSize: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 4 }}
                        />
                        <Text variant="bodySmall" style={{ color: '#666', flex: 1 }}>
                          Cal: {m.calories} · P: {m.protein}g · F: {m.fat}g · C: {m.carbs}g
                        </Text>
                      </View>
                    </View>
                  );
                })}
                <Divider style={{ marginVertical: 8 }} />
                <Text variant="bodyMedium" style={{ fontWeight: '700' }}>
                  Total: {Math.round(recipeLiveTotalWeight())}g
                </Text>
                <Text variant="bodySmall" style={{ color: '#666', marginBottom: 8 }}>
                  Cal: {recipeLiveMacros().calories} · P: {recipeLiveMacros().protein}g · F: {recipeLiveMacros().fat}g · C: {recipeLiveMacros().carbs}g
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Checkbox status={updateRecipe ? 'checked' : 'unchecked'} onPress={() => setUpdateRecipe(!updateRecipe)} />
                  <Text onPress={() => setUpdateRecipe(!updateRecipe)}>Update the recipe with these weights</Text>
                </View>
              </ScrollView>
            ) : (
              <>
                <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
                  Selected: <Text style={{ fontWeight: 'bold' }}>{selectedProduct!.name}</Text>
                </Text>
                <TextInput label="Weight (grams)" value={weightInput} onChangeText={setWeightInput} keyboardType="decimal-pad" autoFocus />
              </>
            )}
          </Dialog.Content>
          {(selectedProduct || selectedRecipe || isNewProduct) && (
            <View style={{ paddingHorizontal: 24, paddingBottom: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <Text style={{ fontSize: 12, color: '#555', fontWeight: '600' }}>Portion: {portionPct}%</Text>
                <Text style={{ fontSize: 12, color: '#999' }}>
                  {selectedRecipe
                    ? `${Math.round(recipeLiveTotalWeight() * portionPct / 100 * 10) / 10}g`
                    : weightInput ? `${Math.round(n(weightInput) * portionPct / 100 * 10) / 10}g` : ''}
                </Text>
              </View>
              <Slider
                value={portionPct}
                onValueChange={(v: number) => setPortionPct(Math.round(v))}
                minimumValue={0}
                maximumValue={100}
                step={5}
                minimumTrackTintColor="#66BB6A"
                maximumTrackTintColor="#ddd"
                thumbTintColor="#66BB6A"
              />
            </View>
          )}
          <Dialog.Actions>
            <Button onPress={closeAddDialog}>Cancel</Button>
            {(selectedProduct || selectedRecipe || isNewProduct) && <Button onPress={handleAdd}>Add</Button>}
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {isToday && (
        <FAB icon="plus" style={styles.fab} onPress={openAddDialog} />
      )}

      <Portal>
        <Dialog visible={!!editState} onDismiss={() => setEditState(null)}>
          <Dialog.Title>Edit Meal</Dialog.Title>
          <Dialog.Content>
            {editState && editState.ingredients.length > 0 ? (
              <ScrollView style={{ maxHeight: 400 }}>
                <Text variant="titleSmall" style={{ fontWeight: '700', marginBottom: 8 }}>
                  {editState.meal.product_name} — Ingredients
                </Text>
                {editState.ingredients.map((ing, index) => {
                  const w = n(ing.editWeight) || 0;
                  const m = calculateMacros(
                    { name: ing.product_name!, calories: ing.calories!, protein: ing.protein!, fat: ing.fat!, carbs: ing.carbs! },
                    w
                  );
                  return (
                    <View key={ing.id} style={{ marginBottom: 8 }}>
                      <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{ing.product_name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <NativeTextInput
                          value={ing.editWeight}
                          onChangeText={(v) => updateEditIngWeight(index, v)}
                          keyboardType="decimal-pad"
                          placeholder="g"
                          style={{ width: 60, backgroundColor: '#fff', textAlign: 'center', fontSize: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 4 }}
                        />
                        <Text variant="bodySmall" style={{ color: '#666', flex: 1 }}>
                          Cal: {m.calories} · P: {m.protein}g · F: {m.fat}g · C: {m.carbs}g
                        </Text>
                      </View>
                    </View>
                  );
                })}
                <Divider style={{ marginVertical: 8 }} />
                <Text variant="bodyMedium" style={{ fontWeight: '700' }}>
                  Total: {Math.round(editIngTotalWeight())}g
                </Text>
                <Text variant="bodySmall" style={{ color: '#666', marginBottom: 8 }}>
                  Cal: {editIngLiveMacros().calories} · P: {editIngLiveMacros().protein}g · F: {editIngLiveMacros().fat}g · C: {editIngLiveMacros().carbs}g
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Checkbox
                    status={editState.updateRecipe ? 'checked' : 'unchecked'}
                    onPress={() => setEditState((prev) => prev ? { ...prev, updateRecipe: !prev.updateRecipe } : prev)}
                  />
                  <Text onPress={() => setEditState((prev) => prev ? { ...prev, updateRecipe: !prev.updateRecipe } : prev)}>
                    Update the recipe with these weights
                  </Text>
                </View>
              </ScrollView>
            ) : editState ? (() => {
              const w = n(editState.weight) || 0;
              const m = calculateMacros(
                { name: editState.meal.product_name!, calories: editState.meal.calories!, protein: editState.meal.protein!, fat: editState.meal.fat!, carbs: editState.meal.carbs! },
                w
              );
              return (
                <>
                  <Text variant="bodyMedium" style={{ fontWeight: '700', marginBottom: 12 }}>{editState.meal.product_name}</Text>
                  <TextInput
                    label="Weight (grams)"
                    value={editState.weight}
                    onChangeText={(v) => setEditState((prev) => prev ? { ...prev, weight: v } : prev)}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                  <Text variant="bodySmall" style={{ color: '#666', marginTop: 8 }}>
                    Cal: {m.calories} · P: {m.protein}g · F: {m.fat}g · C: {m.carbs}g
                  </Text>
                </>
              );
            })() : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={handleEditRemove} textColor="#E53935">Remove</Button>
            <Button onPress={() => setEditState(null)}>Cancel</Button>
            <Button onPress={handleEditSave}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Portal>
        <Dialog visible={targetDialogVisible} onDismiss={() => setTargetDialogVisible(false)}>
          <Dialog.Title>Daily Targets</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Calorie target"
              value={tCal}
              onChangeText={handleCaloriesChange}
              keyboardType="decimal-pad"
              style={{ marginBottom: 8 }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput label="Protein (g)" value={tProtein} onChangeText={handleProteinChange} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <TextInput label="Fat (g)" value={tFat} onChangeText={handleFatChange} keyboardType="decimal-pad" style={{ flex: 1 }} />
            </View>
            <TextInput
              label="Carbs (g) — auto-calculated"
              value={tCarbs}
              onChangeText={setTCarbs}
              keyboardType="decimal-pad"
              style={{ marginTop: 8 }}
            />
            <Text variant="bodySmall" style={{ color: '#999', marginTop: 8 }}>
              Editing calories auto-distributes macros (30% P / 25% F / 45% C).{'\n'}
              Editing protein or fat recalculates carbs from remaining calories.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={clearTargets} textColor="#E53935">Clear</Button>
            <Button onPress={() => setTargetDialogVisible(false)}>Cancel</Button>
            <Button onPress={saveTargetSettings}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingTop: 4 },
  navBtn: { margin: 0 },
  dateText: { fontWeight: '700', color: '#333', minWidth: 140, textAlign: 'center' },
  divider: { marginVertical: 4 },
  mealsTitle: { paddingHorizontal: 16, marginBottom: 4, color: '#555' },
  empty: { textAlign: 'center', marginTop: 24, color: '#999' },
  fab: { position: 'absolute', right: 16, bottom: 16, backgroundColor: '#66BB6A' },
  targetCard: { marginHorizontal: 6, marginVertical: 4, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, elevation: 2 },
  targetRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 4 },
  targetLabel: { width: 52, fontWeight: '700' as const, color: '#555', fontSize: 10 },
  targetBarWrap: { flex: 1, position: 'relative' as const, height: 20, borderRadius: 10, overflow: 'hidden' as const },
  targetBarBg: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, borderRadius: 10 },
  targetBarFill: { position: 'absolute' as const, top: 0, left: 0, bottom: 0, borderRadius: 10 },
  targetBarOverlay: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 6 },
  barText: { fontSize: 10, fontWeight: '700' as const },
  barTextLeft: { color: '#fff' },
  barTextRight: { color: '#777' },
  barTextOver: { color: '#E53935' },
});
