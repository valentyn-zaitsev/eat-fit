import { Stack } from 'expo-router';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { Suspense, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { initDatabase } from '../src/db/database';
import { DbProvider } from '../src/db/DbContext';
import { getRoomCode, startSync } from '../src/db/firestoreSync';

function useRegisterServiceWorker() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
}

function PwaHead() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const doc = document;
    const head = doc.head;

    const setMeta = (name: string, content: string) => {
      let el = head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) { el = doc.createElement('meta'); el.name = name; head.appendChild(el); }
      el.content = content;
    };

    // Manifest link
    if (!head.querySelector('link[rel="manifest"]')) {
      const link = doc.createElement('link');
      link.rel = 'manifest';
      link.href = '/manifest.json';
      head.appendChild(link);
    }

    // Apple-specific meta
    setMeta('apple-mobile-web-app-capable', 'yes');
    setMeta('apple-mobile-web-app-status-bar-style', 'default');
    setMeta('apple-mobile-web-app-title', 'Eat&Fit');
    setMeta('theme-color', '#66BB6A');

    // Prevent iOS Safari auto-zoom on input focus
    const viewport = head.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    if (viewport && !viewport.content.includes('maximum-scale')) {
      viewport.content = viewport.content + ', maximum-scale=1';
    }

    // Apple touch icon
    if (!head.querySelector('link[rel="apple-touch-icon"]')) {
      const link = doc.createElement('link');
      link.rel = 'apple-touch-icon';
      link.href = '/icon-192.svg';
      head.appendChild(link);
    }
  }, []);

  return null;
}

const theme = {
  ...MD3LightTheme,
  colors: { ...MD3LightTheme.colors, primary: '#66BB6A', secondary: '#FF6B6B' },
};

function DbBridge({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();

  // Start Firestore sync if room code is saved
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const room = getRoomCode();
    if (!room) return;
    const unsub = startSync(db, room);
    return () => unsub();
  }, [db]);

  return <DbProvider value={db}>{children}</DbProvider>;
}

export default function RootLayout() {
  useRegisterServiceWorker();

  return (
    <SQLiteProvider databaseName="macro-tracker.db" onInit={initDatabase}
      useSuspense>
      <Suspense fallback={<View style={s.center}><ActivityIndicator size="large" color="#66BB6A" /></View>}>
        <DbBridge>
          <SafeAreaProvider>
            <PaperProvider theme={theme}>
              <PwaHead />
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="add-product" options={{ title: 'Add Product' }} />
                <Stack.Screen name="edit-product" options={{ title: 'Edit Product' }} />
                <Stack.Screen name="backup" options={{ title: 'Backup & Restore' }} />
                <Stack.Screen name="scanner" options={{ title: 'Scan Label' }} />
                <Stack.Screen name="recipe/[id]" options={{ title: 'Recipe' }} />
                <Stack.Screen name="+not-found" />
              </Stack>
            </PaperProvider>
          </SafeAreaProvider>
        </DbBridge>
      </Suspense>
    </SQLiteProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
