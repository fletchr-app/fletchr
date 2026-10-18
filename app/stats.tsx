import { Stack, useLocalSearchParams, useTheme } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ErrorText, Screen } from '@/components/form';
import { ScoreChart } from '@/components/score-chart';
import { VolumeChart } from '@/components/volume-chart';
import { useAuth } from '@/lib/auth';
import { useRemote } from '@/lib/use-remote';

const WEEKS = 12;

const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** Volume and average scores: your own, or those of an archer you coach (with ?owner=). */
export default function StatsScreen() {
  const { colors } = useTheme();
  const { owner, name } = useLocalSearchParams<{ owner?: string; name?: string }>();
  const { api } = useAuth();
  const load = useCallback(
    async () =>
      (
        await api.GET('/api/stats/', {
          params: { query: { owner: owner ? Number(owner) : undefined, tz: timeZone(), weeks: WEEKS } },
        })
      ).data ?? null,
    [api, owner],
  );
  const { data, error, loading } = useRemote(load);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <Stack.Screen options={{ title: name ? `${name}: statistics` : 'Statistics' }} />
      <Screen>
        <ErrorText>{error}</ErrorText>
        {loading && <Text style={{ color: colors.text }}>Loading…</Text>}
        {data && (
          <>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Tile label="This week" value={data.volume.this_week} />
              <Tile label="This month" value={data.volume.this_month} />
              <Tile label="All time" value={data.volume.total} />
            </View>
            <Text style={{ color: colors.text, opacity: 0.6 }}>Arrows shot, scored or not.</Text>
            <VolumeChart weeks={data.volume.weeks} />
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', marginTop: 8 }}>Average score</Text>
            {data.scores.length === 0 && <Text style={{ color: colors.text }}>No scored arrows yet.</Text>}
            {data.scores.map((group) => (
              <ScoreChart key={`${group.face}-${group.distance_m}`} group={group} />
            ))}
          </>
        )}
      </Screen>
    </ScrollView>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: colors.text, opacity: 0.7 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 28, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
