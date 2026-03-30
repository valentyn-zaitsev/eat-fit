import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, Alert, ScrollView, Platform, TouchableOpacity, TextInput as NativeTextInput } from 'react-native';
import { Text, List, Divider, TextInput, Button, Dialog, Portal, FAB, IconButton, Checkbox } from 'react-native-paper';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { recipeRepository } from '../../src/db/recipeRepository';
import { productRepository } from '../../src/db/productRepository';
import { useDb } from '../../src/db/DbContext';
import { MacroCard } from '../../src/components/MacroCard';
import { calculateMacros, sumMacros, MacroResult } from '../../src/models/Product';
import { RecipeIngredient } from '../../src/models/Recipe';
import { Product } from '../../src/models/Product';
import { syncRecipeToCloud, syncProductToCloud } from '../../src/db/firestoreSync';

const n = (s: string) => Number(s.replace(',', '.'));

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const recipeId = Number(id);

  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [totalMacros, setTotalMacros] = useState<MacroResult>({ calories: 0, protein: 0, fat: 0, carbs: 0 });
  const [per100gMacros, setPer100gMacros] = useState<MacroResult>({ calories: 0, protein: 0, fat: 0, carbs: 0 });
  const [totalWeight, setTotalWeight] = useState(0);
  const [recipeName, setRecipeName] = useState('');

  // Add ingredient dialog
  const [addDialogVisible, setAddDialogVisible] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [weightInput, setWeightInput] = useState('');
  // New product inline
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCalories, setNewCalories] = useState('');
  const [newProtein, setNewProtein] = useState('');
  const [newFat, setNewFat] = useState('');
  const [newCarbs, setNewCarbs] = useState('');

  const loadData = useCallback(async () => {
    const recipe = await recipeRepository.getById(db, recipeId);
    if (recipe) setRecipeName(recipe.name);
    const ings = await recipeRepository.getIngredients(db, recipeId);
    setIngredients(ings);
    const macrosList = ings.map((ing) =>
      calculateMacros(
        { name: ing.product_name!, calories: ing.calories!, protein: ing.protein!, fat: ing.fat!, carbs: ing.carbs! },
        ing.ingredient_weight
      )
    );
    const total = sumMacros(macrosList);
    setTotalMacros(total);
    const tw = ings.reduce((sum, i) => sum + i.ingredient_weight, 0);
    setTotalWeight(Math.round(tw * 10) / 10);
    if (tw > 0) {
      const r = (v: number) => Math.round(v / tw * 100 * 10) / 10;
      setPer100gMacros({ calories: r(total.calories), protein: r(total.protein), fat: r(total.fat), carbs: r(total.carbs) });
    } else {
      setPer100gMacros({ calories: 0, protein: 0, fat: 0, carbs: 0 });
    }
  }, [db, recipeId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const openAddDialog = async () => {
    const products = await productRepository.getAll(db);
    setAllProducts(products.filter((p) => !p.name.startsWith('🍽')));
    setAddDialogVisible(true);
  };

  const filteredProducts = productSearch.trim()
    ? allProducts.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()))
    : allProducts;

  const handleAddIngredient = async () => {
    if (!weightInput || isNaN(n(weightInput))) return;

    if (isNewProduct) {
      if (!newName.trim() || isNaN(n(newCalories)) || isNaN(n(newProtein)) || isNaN(n(newFat)) || isNaN(n(newCarbs))) return;
      const productId = await productRepository.create(db, {
        name: newName.trim(),
        calories: n(newCalories),
        protein: n(newProtein),
        fat: n(newFat),
        carbs: n(newCarbs),
      });
      syncProductToCloud({ name: newName.trim(), calories: n(newCalories), protein: n(newProtein), fat: n(newFat), carbs: n(newCarbs) }).catch(() => {});
      await recipeRepository.addIngredient(db, recipeId, productId, n(weightInput));
    } else {
      if (!selectedProduct) return;
      await recipeRepository.addIngredient(db, recipeId, selectedProduct.id!, n(weightInput));
    }
    closeAddDialog();
    syncRecipeToCloud(db, recipeId).catch(() => {});
    loadData();
  };

  const closeAddDialog = () => {
    setAddDialogVisible(false);
    setSelectedProduct(null);
    setProductSearch('');
    setAllProducts([]);
    setWeightInput('');
    setIsNewProduct(false);
    setNewName(''); setNewCalories(''); setNewProtein(''); setNewFat(''); setNewCarbs('');
  };

  const handleRemove = async (ingredientId: number) => {
    if (Platform.OS === 'web') {
      if (confirm('Remove this ingredient?')) {
        await recipeRepository.removeIngredient(db, ingredientId);
        syncRecipeToCloud(db, recipeId).catch(() => {});
        loadData();
      }
    } else {
      Alert.alert('Remove?', 'Remove this ingredient?', [
        { text: 'Cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          await recipeRepository.removeIngredient(db, ingredientId);
          loadData();
        }},
      ]);
    }
  };

  const handleWeightChange = async (ingredientId: number, value: string) => {
    const weight = n(value);
    if (isNaN(weight) || weight <= 0) return;
    await recipeRepository.updateIngredientWeight(db, ingredientId, weight);
    syncRecipeToCloud(db, recipeId).catch(() => {});
    loadData();
  };

  const [editingWeights, setEditingWeights] = useState<Record<number, string>>({});

  const [movingIndex, setMovingIndex] = useState<number | null>(null);

  const handleLongPress = (index: number) => {
    setMovingIndex(index);
  };

  const handleTapWhileMoving = async (targetIndex: number) => {
    if (movingIndex === null || movingIndex === targetIndex) {
      setMovingIndex(null);
      return;
    }
    const a = ingredients[movingIndex];
    const b = ingredients[targetIndex];
    await recipeRepository.swapIngredientOrder(db, a.id!, a.sort_order, b.id!, b.sort_order);
    setMovingIndex(null);
    syncRecipeToCloud(db, recipeId).catch(() => {});
    loadData();
  };

  if (!recipeId) return null;

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>{recipeName}</Text>
      <MacroCard macros={per100gMacros} label={`Per 100g (total: ${totalWeight}g)`} />
      <MacroCard macros={totalMacros} label="Total Macros" />
      <Divider style={styles.divider} />
      <Text variant="titleMedium" style={styles.ingredientsTitle}>Ingredients</Text>
      <FlatList
        data={ingredients}
        keyExtractor={(item) => String(item.id)}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={<Text style={styles.empty}>No ingredients yet.</Text>}
        renderItem={({ item, index }) => {
          const m = calculateMacros(
            { name: item.product_name!, calories: item.calories!, protein: item.protein!, fat: item.fat!, carbs: item.carbs! },
            item.ingredient_weight
          );
          const isMoving = movingIndex === index;
          const isTarget = movingIndex !== null && movingIndex !== index;
          const RowWrapper = isTarget ? TouchableOpacity : View;
          const rowProps = isTarget ? { onPress: () => handleTapWhileMoving(index), activeOpacity: 0.7 } : {};
          return (
            <RowWrapper
              {...rowProps}
              style={[styles.ingredientRow, isMoving && styles.ingredientMoving, isTarget && styles.ingredientTarget]}
            >
              <IconButton icon="drag" size={20} style={styles.dragHandle} onPress={() => isTarget ? handleTapWhileMoving(index) : handleLongPress(index)} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{item.product_name}</Text>
                <Text variant="bodySmall" style={{ color: '#666' }}>
                  Cal: {m.calories} · P: {m.protein}g · F: {m.fat}g · C: {m.carbs}g
                </Text>
              </View>
              <View style={styles.weightGroup}>
                <NativeTextInput
                  value={editingWeights[item.id!] ?? String(item.ingredient_weight)}
                  onChangeText={(v) => setEditingWeights((prev) => ({ ...prev, [item.id!]: v }))}
                  onBlur={() => {
                    const val = editingWeights[item.id!];
                    if (val !== undefined) {
                      handleWeightChange(item.id!, val);
                      setEditingWeights((prev) => { const next = { ...prev }; delete next[item.id!]; return next; });
                    }
                  }}
                  keyboardType="decimal-pad"
                  style={styles.weightInput}
                />
                <Text variant="bodyMedium" style={{ color: '#555' }}>g</Text>
                <IconButton icon="delete" size={20} onPress={() => handleRemove(item.id!)} style={styles.deleteBtn} />
              </View>
            </RowWrapper>
          );
        }}
      />
      {movingIndex !== null && (
        <Button mode="text" onPress={() => setMovingIndex(null)} style={{ marginBottom: 8 }}>
          Cancel move
        </Button>
      )}
      <Portal>
        <Dialog visible={addDialogVisible} onDismiss={closeAddDialog}>
          <Dialog.Title>Add Ingredient</Dialog.Title>
          <Dialog.Content>
            {!selectedProduct && !isNewProduct ? (
              <>
                <TextInput
                  label="Filter products"
                  value={productSearch}
                  onChangeText={setProductSearch}
                  autoFocus
                  left={<TextInput.Icon icon="magnify" />}
                />
                <ScrollView style={{ maxHeight: 250, marginTop: 8 }}>
                  {filteredProducts.map((p) => (
                    <List.Item
                      key={p.id}
                      title={p.name}
                      description={`Cal: ${p.calories} P: ${p.protein}g F: ${p.fat}g C: ${p.carbs}g`}
                      onPress={() => setSelectedProduct(p)}
                      style={{ paddingVertical: 2 }}
                    />
                  ))}
                  {filteredProducts.length === 0 && (
                    <Text style={{ textAlign: 'center', color: '#999', marginTop: 16 }}>No products found</Text>
                  )}
                </ScrollView>
                <Divider style={{ marginVertical: 12 }} />
                <Button mode="outlined" icon="plus" onPress={() => setIsNewProduct(true)}>
                  Add New Product
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
              </ScrollView>
            ) : (
              <>
                <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
                  Selected: <Text style={{ fontWeight: 'bold' }}>{selectedProduct!.name}</Text>
                </Text>
                <TextInput
                  label="Weight (grams)"
                  value={weightInput}
                  onChangeText={setWeightInput}
                  keyboardType="decimal-pad"
                  autoFocus
                />
              </>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeAddDialog}>Cancel</Button>
            {(selectedProduct || isNewProduct) && <Button onPress={handleAddIngredient}>Add</Button>}
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <FAB icon="plus" style={styles.fab} onPress={openAddDialog} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  title: { fontWeight: '700', marginBottom: 8 },
  divider: { marginVertical: 12 },
  ingredientsTitle: { marginBottom: 8, fontWeight: '600' },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingRight: 4 },
  ingredientMoving: { backgroundColor: '#C8E6C9', borderRadius: 8 },
  ingredientTarget: { backgroundColor: '#F5F5F5', borderRadius: 8 },
  dragHandle: { margin: 0, marginRight: 2, opacity: 0.5 },
  weightGroup: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  weightInput: { width: 60, backgroundColor: '#fff', textAlign: 'center', fontSize: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 4 },
  deleteBtn: { margin: 0 },
  loader: { flex: 1, justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 24, color: '#999' },
  fab: { position: 'absolute', right: 16, bottom: 16, backgroundColor: '#66BB6A' },
});
