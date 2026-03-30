import React, { useState, useRef } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity, Platform } from 'react-native';
import { Button, Text, ActivityIndicator, Surface } from 'react-native-paper';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';

const GOOGLE_VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY ?? '';

interface ParsedMacros {
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
}

function parseMacrosFromText(text: string): Partial<ParsedMacros> {
  const result: Partial<ParsedMacros> = {};
  const patterns: Record<keyof ParsedMacros, RegExp> = {
    calories: /(?:calories|energy|kcal|енергийна стойност|енергия|калории|ккал)[^\d]*(\d+(?:[.,]\d+)?)/i,
    protein:  /(?:protein|proteins|белтъци|белтъчини|протеини)[^\d]*(\d+(?:[.,]\d+)?)\s*g?/i,
    fat:      /(?:total fat|fat|мазнини|общо мазнини)[^\d]*(\d+(?:[.,]\d+)?)\s*g?/i,
    carbs:    /(?:total carbohydrate|carbohydrates|carbs|въглехидрати|общо въглехидрати)[^\d]*(\d+(?:[.,]\d+)?)\s*g?/i,
  };
  for (const [key, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    if (match) result[key as keyof ParsedMacros] = match[1].replace(',', '.');
  }
  return result;
}

async function runOcr(base64Image: string): Promise<string> {
  if (!GOOGLE_VISION_API_KEY) throw new Error('NO_API_KEY');
  const body = {
    requests: [{
      image: { content: base64Image },
      features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
    }],
  };
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const json = await res.json();
  return json.responses?.[0]?.fullTextAnnotation?.text ?? '';
}

export default function ScannerScreen() {
  const router = useRouter();

  if (Platform.OS === 'web') {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium" style={{ marginBottom: 12, fontWeight: '700' }}>Scanner Not Available</Text>
        <Text style={{ color: '#666', textAlign: 'center', paddingHorizontal: 32, marginBottom: 24 }}>
          Camera-based label scanning is not available in the browser version.
          You can add products manually instead.
        </Text>
        <Button mode="contained" onPress={() => router.replace('/add-product')}>
          Add Product Manually
        </Button>
      </View>
    );
  }

  return <NativeScannerScreen />;
}

function NativeScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [parsed, setParsed] = useState<Partial<ParsedMacros> | null>(null);
  const [zoom, setZoom] = useState(0.15);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const router = useRouter();

  if (!permission) return <ActivityIndicator style={styles.center} />;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge" style={styles.permText}>Camera access is needed to scan nutrition labels.</Text>
        <Button mode="contained" onPress={requestPermission} style={styles.permBtn}>Grant Permission</Button>
      </View>
    );
  }

  const handleTapToFocus = (e: any) => {
    const { locationX, locationY, pageX, pageY } = e.nativeEvent;
    setFocusPoint({ x: locationX, y: locationY });
    setTimeout(() => setFocusPoint(null), 1000);
  };

  const handleCapture = async () => {
    if (!cameraRef.current || scanning) return;
    setScanning(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1, base64: true, skipProcessing: true });
      if (!photo?.base64) throw new Error('No image data');

      let text: string;
      try {
        text = await runOcr(photo.base64);
      } catch (e: any) {
        if (e.message === 'NO_API_KEY') {
          Alert.alert('API Key Missing', 'Set EXPO_PUBLIC_GOOGLE_VISION_API_KEY in your .env file.');
          return;
        }
        throw e;
      }

      if (!text) {
        Alert.alert('No text found', 'Could not detect any text. Try better lighting or get closer.');
        return;
      }

      const macros = parseMacrosFromText(text);
      if (Object.keys(macros).length === 0) {
        Alert.alert('Could not parse', 'Text detected but no macro values found. Try a clearer photo.');
        return;
      }

      setParsed(macros);
    } catch (e) {
      Alert.alert('Error', 'Failed to process image.');
    } finally {
      setScanning(false);
    }
  };

  const handleUse = () => {
    if (!parsed) return;
    const params = new URLSearchParams();
    if (parsed.calories) params.set('calories', parsed.calories);
    if (parsed.protein)  params.set('protein',  parsed.protein);
    if (parsed.fat)      params.set('fat',       parsed.fat);
    if (parsed.carbs)    params.set('carbs',     parsed.carbs);
    router.replace(`/add-product?${params.toString()}`);
  };

  if (parsed) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium" style={styles.resultTitle}>Scan Result</Text>
        {parsed.calories && <Text>Calories: {parsed.calories} kcal</Text>}
        {parsed.protein  && <Text>Protein: {parsed.protein} g</Text>}
        {parsed.fat      && <Text>Fat: {parsed.fat} g</Text>}
        {parsed.carbs    && <Text>Carbs: {parsed.carbs} g</Text>}
        <Button mode="contained" onPress={handleUse} style={styles.useBtn}>Use These Values</Button>
        <Button onPress={() => setParsed(null)}>Scan Again</Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.camera} activeOpacity={1} onPress={handleTapToFocus}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          autofocus="on"
          zoom={zoom}
        >
          <View style={styles.overlay}>
            <View style={styles.frame} />
            <Text style={styles.hint}>Tap to focus · Position label inside the frame</Text>
          </View>
          {focusPoint && (
            <View style={[styles.focusRing, { top: focusPoint.y - 30, left: focusPoint.x - 30 }]} />
          )}
        </CameraView>
      </TouchableOpacity>

      <Surface style={styles.controls} elevation={4}>
        <View style={styles.zoomRow}>
          <Button compact onPress={() => setZoom(z => Math.max(0, +(z - 0.05).toFixed(2)))}>−</Button>
          <Text style={styles.zoomLabel}>Zoom: {Math.round(1 + zoom * 8)}×</Text>
          <Button compact onPress={() => setZoom(z => Math.min(0.5, +(z + 0.05).toFixed(2)))}>+</Button>
        </View>
        <Button
          mode="contained"
          icon={scanning ? undefined : 'camera'}
          loading={scanning}
          onPress={handleCapture}
          style={styles.captureBtn}
        >
          {scanning ? 'Processing...' : 'Capture & Scan'}
        </Button>
        <Button mode="outlined" onPress={() => router.back()}>Cancel</Button>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 280, height: 180, borderWidth: 2, borderColor: '#66BB6A', borderRadius: 8, backgroundColor: 'transparent' },
  hint: { color: '#fff', marginTop: 12, fontSize: 13, textShadowColor: '#000', textShadowRadius: 4, textAlign: 'center' },
  focusRing: {
    position: 'absolute', width: 60, height: 60,
    borderWidth: 2, borderColor: '#fff', borderRadius: 30,
  },
  controls: { padding: 16, gap: 10 },
  zoomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 4 },
  zoomLabel: { fontSize: 13, color: '#555', minWidth: 70, textAlign: 'center' },
  captureBtn: { backgroundColor: '#66BB6A', marginBottom: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  permText: { textAlign: 'center', marginBottom: 16 },
  permBtn: { backgroundColor: '#66BB6A' },
  resultTitle: { fontWeight: '700', marginBottom: 8 },
  useBtn: { backgroundColor: '#66BB6A', marginTop: 16 },
});
