import { Link, Stack, useLocalSearchParams, useTheme } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ErrorText, Screen } from '@/components/form';
import { NotesSection } from '@/components/notes-section';
import { useAuth } from '@/lib/auth';
import { useRemote } from '@/lib/use-remote';

const REFRESH_MS = 10000;
const always = () => true;

/** The sessions of one archer, for their coach. */
export default function ArcherSessions() {
  const { colors } = useTheme();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { api } = useAuth();
  const load = useCallback(
    async () => (await api.GET('/api/sessions/', { params: { query: { owner: Number(id) } } })).data ?? null,
    [api, id],
  );
  const { data, error, loading } = useRemote(load, REFRESH_MS, always);

  return (
    <ScrollView>
      <Stack.Screen options={{ title: name ?? 'Archer' }} />
      <Screen>
        <Link href={{ pathname: '/stats', params: { owner: id, name } }} style={{ color: colors.primary, fontSize: 18, fontWeight: '600' }}>
          Statistics
        </Link>
        <NotesSection archerId={Number(id)} />
        <ErrorText>{error}</ErrorText>
        {loading && <Text style={{ color: colors.text }}>Loading…</Text>}
        {data?.length === 0 && <Text style={{ color: colors.text }}>No sessions yet.</Text>}
        {data?.map((s) => (
          <Link key={s.id} href={{ pathname: '/sessions/[id]', params: { id: s.id } }}>
            <View style={{ gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>
                {new Date(s.started_at).toLocaleString()} · {s.type}
                {s.ended_at ? '' : '  ● in progress'}
              </Text>
              <Text style={{ color: colors.text, opacity: 0.7 }}>
                {s.location ? `${s.location} · ` : ''}
                {s.ends} ends · {s.scored_arrows + s.volume_arrows} arrows{s.ends > 0 ? ` · ${s.score_total} points` : ''}
              </Text>
            </View>
          </Link>
        ))}
      </Screen>
    </ScrollView>
  );
}
