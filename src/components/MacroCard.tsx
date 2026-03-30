import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { MacroResult } from '../models/Product';

interface MacroCardProps {
  macros: MacroResult;
  label?: string;
}

export const MacroCard: React.FC<MacroCardProps> = ({ macros, label }) => {
  return (
    <Surface style={styles.card} elevation={2}>
      {label && <Text variant="titleMedium" style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        <MacroItem label="Calories" value={macros.calories} unit="kcal" color="#FF6B6B" />
        <MacroItem label="Protein"  value={macros.protein}  unit="g"    color="#4ECDC4" />
        <MacroItem label="Fat"      value={macros.fat}      unit="g"    color="#FFE66D" />
        <MacroItem label="Carbs"    value={macros.carbs}    unit="g"    color="#A8E6CF" />
      </View>
    </Surface>
  );
};

const MacroItem = ({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) => (
  <View style={styles.item}>
    <View style={[styles.dot, { backgroundColor: color }]} />
    <Text variant="labelSmall" style={styles.macroLabel}>{label}</Text>
    <Text variant="titleSmall" style={styles.macroValue}>{value}{unit}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, marginVertical: 8 },
  label: { marginBottom: 12, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  item: { alignItems: 'center', flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
  macroLabel: { color: '#666', marginBottom: 2 },
  macroValue: { fontWeight: '700' },
});
