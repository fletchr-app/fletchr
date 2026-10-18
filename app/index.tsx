import { Link, useTheme } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useServer, useServerHealth } from '@/lib/server';

const HEALTH_LABEL = {
  checking: 'Checking server…',
  ok: 'Server reachable',
  unreachable: 'Server not reachable',
};

export default function HomeScreen() {
  const { colors } = useTheme();
  const { url } = useServer();
  const health = useServerHealth();

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>Archery Coach</Text>
      <Text style={{ color: colors.text }}>{HEALTH_LABEL[health]}</Text>
      <Text style={[styles.url, { color: colors.text }]}>{url}</Text>
      <Link href="/settings" style={{ color: colors.primary }}>
        Change server address
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 },
  title: { fontSize: 28, fontWeight: '600' },
  url: { fontFamily: 'monospace', opacity: 0.7 },
});
