import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { TextInput, Button, Text, Divider } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { productRepository } from '../src/db/productRepository';
import { useDb } from '../src/db/DbContext';
import { MacroCard } from '../src/components/MacroCard';
import { calculateMacros } from '../src/models/Product';
import { syncProductToCloud } from '../src/db/firestoreSync';

const n = (s: string) => Number(s.replace(',', '.'));

export default function EditProductScreen() {
  const router = useRouter();
  const db = useDb();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    productRepository.getById(db, Number(id)).then((p) => {
      if (p) {
        setName(p.name);
        setCalories(String(p.calories));
        setProtein(String(p.protein));
        setFat(String(p.fat));
        setCarbs(String(p.carbs));
      }
    });
  }, [id]);

  const isValid =
    name.trim().length > 0 &&
    !isNaN(n(calories)) && n(calories) >= 0 &&
    !isNaN(n(protein)) && n(protein) >= 0 &&
    !isNaN(n(fat)) && n(fat) >= 0 &&
    !isNaN(n(carbs)) && n(carbs) >= 0;

  const previewMacros = isValid
    ? calculateMacros(
        { name, calories: n(calories), protein: n(protein), fat: n(fat), carbs: n(carbs) },
        100
      )
    : null;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await productRepository.update(db, Number(id), {
        name: name.trim(),
        calories: n(calories),
        protein: n(protein),
        fat: n(fat),
        carbs: n(carbs),
      });
      syncProductToCloud({ name: name.trim(), calories: n(calories), protein: n(protein), fat: n(fat), carbs: n(carbs) }).catch(() => {});
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="titleMedium" style={styles.section}>Product Info (per 100g)</Text>

      <TextInput label="Product name" value={name} onChangeText={setName} style={styles.input} autoFocus />

      <View style={styles.row}>
        <TextInput label="Calories (kcal)" value={calories} onChangeText={setCalories} keyboardType="decimal-pad" style={[styles.input, styles.half]} />
        <TextInput label="Protein (g)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" style={[styles.input, styles.half]} />
      </View>
      <View style={styles.row}>
        <TextInput label="Fat (g)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" style={[styles.input, styles.half]} />
        <TextInput label="Carbs (g)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" style={[styles.input, styles.half]} />
      </View>

      {previewMacros && (
        <>
          <Divider style={styles.divider} />
          <MacroCard macros={previewMacros} label="Preview (100g)" />
        </>
      )}

      <Button
        mode="contained"
        onPress={handleSave}
        loading={saving}
        disabled={!isValid || saving}
        style={styles.saveBtn}
      >
        Save Changes
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  section: { marginBottom: 12, fontWeight: '600', color: '#333' },
  input: { marginBottom: 8, backgroundColor: '#fff' },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  divider: { marginVertical: 16 },
  saveBtn: { marginTop: 8, marginBottom: 32, backgroundColor: '#66BB6A' },
});
