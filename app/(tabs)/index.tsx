import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, Alert } from 'react-native';
import { FAB, Searchbar, Text, List, Divider, IconButton } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { productRepository } from '../../src/db/productRepository';
import { useDb } from '../../src/db/DbContext';
import { Product } from '../../src/models/Product';
import { deleteProductFromCloud } from '../../src/db/firestoreSync';

export default function ProductsScreen() {
  const db = useDb();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const router = useRouter();

  const loadProducts = useCallback(async () => {
    const results = search.trim()
      ? await productRepository.search(db, search)
      : await productRepository.getAll(db);
    setProducts(results.filter((p) => !p.name.startsWith('🍽')));
  }, [db, search]);

  useFocusEffect(useCallback(() => { loadProducts(); }, [loadProducts]));

  const handleDelete = (item: Product) => {
    Alert.alert('Delete Product', `Delete "${item.name}"?`, [
      { text: 'Cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const name = item.name;
          await productRepository.delete(db, item.id!);
          deleteProductFromCloud(name).catch(() => {});
          loadProducts();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="Search products..."
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={loadProducts}
        style={styles.searchbar}
      />
      <FlatList
        data={products}
        keyExtractor={(item) => String(item.id)}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={
          <Text style={styles.empty}>No products yet. Tap + to add one!</Text>
        }
        renderItem={({ item }) => (
          <List.Item
            title={item.name}
            description={`Cal: ${item.calories} | P: ${item.protein}g | F: ${item.fat}g | C: ${item.carbs}g`}
            left={(props) => <List.Icon {...props} icon="food" />}
            right={() => (
              <View style={styles.actions}>
                <IconButton icon="pencil" size={20} onPress={() => router.push(`/edit-product?id=${item.id}`)} />
                <IconButton icon="delete" size={20} onPress={() => handleDelete(item)} />
              </View>
            )}
          />
        )}
      />
      <FAB icon="plus" style={styles.fab} onPress={() => router.push('/add-product')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  searchbar: { margin: 8, borderRadius: 8 },
  empty: { textAlign: 'center', marginTop: 40, color: '#999' },
  fab: { position: 'absolute', right: 16, bottom: 16, backgroundColor: '#66BB6A' },
  actions: { flexDirection: 'row', alignItems: 'center' },
});
