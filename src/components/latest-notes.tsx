import { useTheme } from 'expo-router';
import { useCallback } from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { useRemote } from '@/lib/use-remote';

const SHOWN = 5;

/** The newest notes your coaches wrote about you and shared with you. */
export function LatestNotes({ userId }: { userId: number }) {
  const { colors } = useTheme();
  const { api } = useAuth();
  const load = useCallback(
    async () => (await api.GET('/api/notes/', { params: { query: { archer: userId, visibility: 'shared' } } })).data ?? null,
    [api, userId],
  );
  const { data } = useRemote(load);
  if (!data?.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text, fontWeight: '600' }}>From your coaches</Text>
      {data.slice(0, SHOWN).map((note) => (
        <View key={note.id}>
          <Text style={{ color: colors.text, opacity: 0.7 }}>
            {note.author_name} · {new Date(note.created_at).toLocaleDateString()}
          </Text>
          <Text style={{ color: colors.text }}>{note.body}</Text>
        </View>
      ))}
    </View>
  );
}
