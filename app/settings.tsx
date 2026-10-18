import { useTheme } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DEFAULT_SERVER_URL, useServer, useServerHealth } from '@/lib/server';

export default function SettingsScreen() {
  const { url } = useServer();
  // Remount the form when the saved address changes, so the field shows it.
  return <ServerForm key={url} />;
}

function ServerForm() {
  const { colors } = useTheme();
  const { url, isOverride, setUrl } = useServer();
  const health = useServerHealth();
  const [draft, setDraft] = useState(url);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.text }]}>Server address</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder={DEFAULT_SERVER_URL}
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
      />
      <Text style={{ color: colors.text, opacity: 0.7 }}>
        Default from build: {DEFAULT_SERVER_URL}
        {isOverride ? ' (overridden on this device)' : ''}
      </Text>
      <Text style={{ color: colors.text }}>Status: {health}</Text>
      <View style={styles.row}>
        <Pressable onPress={() => setUrl(draft)} style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={styles.buttonText}>Save</Text>
        </Pressable>
        <Pressable onPress={() => setUrl(null)} style={[styles.button, { backgroundColor: colors.border }]}>
          <Text style={{ color: colors.text }}>Reset to default</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, maxWidth: 600, width: '100%', alignSelf: 'center' },
  label: { fontSize: 16, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 16 },
  row: { flexDirection: 'row', gap: 12 },
  button: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  buttonText: { color: 'white', fontWeight: '600' },
});
