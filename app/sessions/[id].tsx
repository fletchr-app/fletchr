import { useLocalSearchParams, useTheme } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { EndRows } from '@/components/end-rows';
import { NotesSection } from '@/components/notes-section';
import { ErrorText, Screen } from '@/components/form';
import { SessionPlots } from '@/components/session-plots';
import type { components } from '@/lib/api-types';
import { useAuth } from '@/lib/auth';
import { gearLine, sessionTotals, usesEnds } from '@/lib/log-model';
import { fromServer } from '@/lib/session-view';
import { useRemote } from '@/lib/use-remote';

const REFRESH_MS = 5000;
// An unfinished session is still being shot: keep fetching it, so a coach watches it fill up.
const stillShooting = (s: components['schemas']['Session']) => !s.ended_at;

/** A session as the server has it, read-only. Used for sessions from other devices and by coaches. */
export default function SessionDetail() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const load = useCallback(
    async () => (await api.GET('/api/sessions/{session_id}/', { params: { path: { session_id: id } } })).data ?? null,
    [api, id],
  );
  const { data, error, loading } = useRemote(load, REFRESH_MS, stillShooting);

  if (!data) {
    return (
      <Screen>
        <Text style={{ color: colors.text }}>{loading ? 'Loading…' : null}</Text>
        <ErrorText>{error}</ErrorText>
      </Screen>
    );
  }
  const session = fromServer(data);
  const { arrows, score } = sessionTotals(session);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <Screen>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '600' }}>
          {session.owner_name} · {session.type}
        </Text>
        <Text style={{ color: colors.text, opacity: 0.7 }}>
          {new Date(session.started_at).toLocaleString()}
          {session.location ? ` · ${session.location}` : ''}
          {session.ended_at ? ' · finished' : ' · in progress'}
        </Text>
        <Text style={{ color: colors.text }}>
          {arrows} arrows{usesEnds(session.type) ? ` · ${score} points` : ''}
        </Text>
        {session.gear && <Text style={{ color: colors.text }}>Equipment: {gearLine(session.gear)}</Text>}
        <ErrorText>{error}</ErrorText>
        <SessionPlots session={session} />
        {session.ends.length > 0 && <EndRows ends={session.ends} />}
        <NotesSection archerId={data.owner} sessionId={data.id} ends={session.ends} />
        {session.volume.map((v) => (
          <View key={v.id}>
            <Text style={{ color: colors.text }}>
              {v.arrow_count} arrows at {Number(v.distance_m)} m
            </Text>
          </View>
        ))}
      </Screen>
    </ScrollView>
  );
}
