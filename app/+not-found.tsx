import { Link, Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text variant="headlineSmall">Screen not found.</Text>
        <Link href="/" style={styles.link}>
          <Text variant="bodyLarge" style={styles.linkText}>Go home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  link: { marginTop: 16 },
  linkText: { color: '#4ECDC4' },
});
