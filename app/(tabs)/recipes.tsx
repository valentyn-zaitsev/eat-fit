import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, Alert } from 'react-native';
import { FAB, Text, List, Divider, Dialog, Portal, TextInput, Button, IconButton } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { recipeRepository } from '../../src/db/recipeRepository';
import { useDb } from '../../src/db/DbContext';
import { Recipe } from '../../src/models/Recipe';
import { syncRecipeToCloud, deleteRecipeFromCloud } from '../../src/db/firestoreSync';

export default function RecipesScreen() {
  const db = useDb();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [createVisible, setCreateVisible] = useState(false);
  const [newRecipeName, setNewRecipeName] = useState('');
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [editName, setEditName] = useState('');
  const router = useRouter();

  const loadRecipes = useCallback(async () => {
    const results = await recipeRepository.getAll(db);
    setRecipes(results);
  }, [db]);

  useFocusEffect(useCallback(() => { loadRecipes(); }, [loadRecipes]));

  const createRecipe = async () => {
    if (!newRecipeName.trim()) return;
    const id = await recipeRepository.create(db, newRecipeName.trim());
    syncRecipeToCloud(db, id).catch(() => {});
    setCreateVisible(false);
    setNewRecipeName('');
    router.push(`/recipe/${id}`);
  };

  const handleRename = async () => {
    if (!editRecipe || !editName.trim()) return;
    await recipeRepository.update(db, editRecipe.id!, editName.trim());
    syncRecipeToCloud(db, editRecipe.id!).catch(() => {});
    setEditRecipe(null);
    loadRecipes();
  };

  const handleDelete = (item: Recipe) => {
    Alert.alert('Delete Recipe', `Delete "${item.name}"?`, [
      { text: 'Cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const name = item.name;
          await recipeRepository.delete(db, item.id!);
          deleteRecipeFromCloud(name).catch(() => {});
          loadRecipes();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={recipes}
        keyExtractor={(item) => String(item.id)}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={<Text style={styles.empty}>No recipes yet. Tap + to create one!</Text>}
        renderItem={({ item }) => (
          <List.Item
            title={item.name}
            description="Tap to open"
            left={(props) => <List.Icon {...props} icon="book-open-variant" />}
            onPress={() => router.push(`/recipe/${item.id}`)}
            right={() => (
              <View style={styles.actions}>
                <IconButton icon="pencil" size={20} onPress={() => { setEditRecipe(item); setEditName(item.name); }} />
                <IconButton icon="delete" size={20} onPress={() => handleDelete(item)} />
              </View>
            )}
          />
        )}
      />
      <Portal>
        <Dialog visible={createVisible} onDismiss={() => setCreateVisible(false)}>
          <Dialog.Title>New Recipe</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Recipe name" value={newRecipeName} onChangeText={setNewRecipeName} autoFocus />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCreateVisible(false)}>Cancel</Button>
            <Button onPress={createRecipe}>Create</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={!!editRecipe} onDismiss={() => setEditRecipe(null)}>
          <Dialog.Title>Rename Recipe</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Recipe name" value={editName} onChangeText={setEditName} autoFocus />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditRecipe(null)}>Cancel</Button>
            <Button onPress={handleRename}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <FAB icon="plus" style={styles.fab} onPress={() => setCreateVisible(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  empty: { textAlign: 'center', marginTop: 40, color: '#999' },
  fab: { position: 'absolute', right: 16, bottom: 16, backgroundColor: '#66BB6A' },
  actions: { flexDirection: 'row', alignItems: 'center' },
});
