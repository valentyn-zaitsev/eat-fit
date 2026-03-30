import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, Platform } from 'react-native';
import { Button, Text, Divider, ActivityIndicator, TextInput } from 'react-native-paper';
import { useDb } from '../src/db/DbContext';
import { backupRepository, BackupData } from '../src/db/backupRepository';
import {
  getRoomCode, setRoomCode, clearRoomCode, pushLocalToCloud, startSync,
} from '../src/db/firestoreSync';

// --- Web helpers ---
function downloadJsonWeb(json: string, filename: string) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pickJsonFileWeb(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

// --- Native helpers (lazy imports to avoid web bundling issues) ---
async function exportNative(json: string) {
  const FileSystem = require('expo-file-system');
  const Sharing = require('expo-sharing');
  const path = FileSystem.documentDirectory + 'eatandfit-backup.json';
  await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Save Eat&Fit Backup' });
}

async function importNative(): Promise<string | null> {
  const DocumentPicker = require('expo-document-picker');
  const FileSystem = require('expo-file-system');
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
  if (result.canceled) return null;
  const file = result.assets[0];
  return await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
}

export default function BackupScreen() {
  const db = useDb();
  const [loading, setLoading] = useState(false);

  // Cloud sync state
  const [roomCode, setRoomCodeState] = useState(getRoomCode() ?? '');
  const [isConnected, setIsConnected] = useState(!!getRoomCode());
  const [syncStatus, setSyncStatus] = useState('');

  useEffect(() => {
    if (!isConnected || !getRoomCode()) return;
    const unsub = startSync(db, getRoomCode()!);
    setSyncStatus('Live sync active');
    return () => { unsub(); setSyncStatus(''); };
  }, [isConnected, db]);

  const handleConnect = () => {
    const code = roomCode.trim().toUpperCase();
    if (!code) return;
    setRoomCode(code);
    setRoomCodeState(code);
    setIsConnected(true);
  };

  const handleDisconnect = () => {
    clearRoomCode();
    setIsConnected(false);
    setSyncStatus('');
  };

  const handlePushToCloud = async () => {
    const code = getRoomCode();
    if (!code) return;
    setLoading(true);
    setSyncStatus('Pushing data...');
    try {
      const result = await pushLocalToCloud(db, code);
      setSyncStatus(`Pushed ${result.products} products, ${result.recipes} recipes`);
      if (Platform.OS === 'web') {
        alert(`Pushed ${result.products} products and ${result.recipes} recipes to cloud.`);
      } else {
        Alert.alert('Done', `Pushed ${result.products} products and ${result.recipes} recipes to cloud.`);
      }
    } catch (e) {
      setSyncStatus('Push failed');
      const msg = 'Failed to push data to cloud.';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const data = await backupRepository.export(db);
      const json = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web') {
        downloadJsonWeb(json, 'eatandfit-backup.json');
      } else {
        await exportNative(json);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to export backup.');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    try {
      let json: string | null;
      if (Platform.OS === 'web') {
        json = await pickJsonFileWeb();
      } else {
        json = await importNative();
      }
      if (!json) return;

      setLoading(true);
      const data: BackupData = JSON.parse(json);

      if (data.version !== 1 || !Array.isArray(data.products) || !Array.isArray(data.recipes)) {
        Alert.alert('Invalid file', 'This does not appear to be a valid Eat&Fit backup.');
        return;
      }

      const { products, recipes, dailyMeals } = await backupRepository.import(db, data);
      Alert.alert('Import complete', `Added ${products} products, ${recipes} recipes, and ${dailyMeals} daily meals.`);
    } catch (e) {
      Alert.alert('Error', 'Failed to import backup. Make sure the file is a valid Eat&Fit backup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text variant="titleMedium" style={styles.title}>Cloud Sync</Text>
      <Text style={styles.desc}>
        Connect to a shared room so products &amp; recipes sync in real-time between devices.
        Both devices must use the same room code.
      </Text>

      {isConnected ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: '#66BB6A', fontWeight: '700', marginBottom: 8 }}>
            Connected to room: {getRoomCode()}
          </Text>
          {syncStatus ? <Text style={{ color: '#888', marginBottom: 8 }}>{syncStatus}</Text> : null}
          <Button mode="contained" icon="cloud-upload" onPress={handlePushToCloud} style={styles.btn} disabled={loading}>
            Push local data to cloud
          </Button>
          <Button mode="outlined" icon="link-off" onPress={handleDisconnect} style={styles.btn}>
            Disconnect
          </Button>
        </View>
      ) : (
        <View style={{ marginTop: 12 }}>
          <TextInput
            label="Room code (e.g. FAMILY)"
            value={roomCode}
            onChangeText={setRoomCodeState}
            autoCapitalize="characters"
            style={{ marginBottom: 12, backgroundColor: '#fff' }}
          />
          <Button mode="contained" icon="link" onPress={handleConnect} style={styles.btn} disabled={!roomCode.trim()}>
            Connect
          </Button>
        </View>
      )}

      <Divider style={styles.divider} />

      <Text variant="titleMedium" style={styles.title}>Backup &amp; Restore</Text>
      <Text style={styles.desc}>
        Export saves all your products, recipes, and daily meals to a JSON file.
        Import adds any missing entries without overwriting existing ones.
      </Text>

      <Divider style={styles.divider} />

      {loading ? (
        <ActivityIndicator size="large" color="#66BB6A" style={styles.loader} />
      ) : (
        <>
          <Button
            mode="contained"
            icon="export"
            onPress={handleExport}
            style={styles.btn}
          >
            Export Backup
          </Button>
          <Button
            mode="outlined"
            icon="import"
            onPress={handleImport}
            style={styles.btn}
          >
            Import Backup
          </Button>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#f5f5f5' },
  title: { fontWeight: '700', marginBottom: 12, color: '#333' },
  desc: { color: '#666', lineHeight: 22 },
  divider: { marginVertical: 24 },
  btn: { marginBottom: 16 },
  loader: { marginTop: 40 },
});
