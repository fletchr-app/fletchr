import { Link, useTheme, type Href } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ErrorText, Screen } from '@/components/form';
import { SyncBanner } from '@/components/sync-banner';
import { useAuth } from '@/lib/auth';
import { useLog } from '@/lib/log';
import { sessionTotals } from '@/lib/log-model';
import { useRemote } from '@/lib/use-remote';

const REFRESH_MS = 15000;
const always = () => true;

type Row = {
  id: string;
  href: Href;
  started_at: string;
  type: string;
  location: string;
  finished: boolean;
  ends: number;
  arrows: number;
  points: number;
};

export default function TrainingList() {
  const { colors } = useTheme();
  const { api, userId } = useAuth();
  const { sessions: local } = useLog();
  const load = useCallback(
    async () => (await api.GET('/api/sessions/', { params: { query: { owner: Number(userId) } } })).data ?? null,
    [api, userId],
  );
  const remote = useRemote(load, REFRESH_MS, always);

  // Sessions on this device can be edited. Others (from another device) are shown as the server has them.
  const rows: Row[] = [
    ...local.map((s) => {
      const { arrows, score } = sessionTotals(s);
      return { id: s.id, href: `/training/${s.id}` as Href, started_at: s.started_at, type: s.type, location: s.location, finished: !!s.ended_at, ends: s.ends.length, arrows, points: score };
    }),
    ...(remote.data ?? [])
      .filter((s) => !local.some((l) => l.id === s.id))
      .map((s) => ({
        id: s.id, href: `/sessions/${s.id}` as Href, started_at: s.started_at, type: s.type, location: s.location ?? '',
        finished: !!s.ended_at, ends: s.ends, arrows: s.scored_arrows + s.volume_arrows, points: s.score_total,
      })),
  ].sort((a, b) => b.started_at.localeCompare(a.started_at));

  return (
    <ScrollView>
      <Screen>
        <SyncBanner />
        <Link href="/training/new" style={{ color: colors.primary, fontSize: 18, fontWeight: '600' }}>
          Start a session
        </Link>
        <ErrorText>{remote.error}</ErrorText>
        {rows.map((row) => (
          <Link key={row.id} href={row.href}>
            <View style={{ gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>
                {new Date(row.started_at).toLocaleString()} · {row.type}
                {row.finished ? '' : ' (in progress)'}
              </Text>
              <Text style={{ color: colors.text, opacity: 0.7 }}>
                {row.location ? `${row.location} · ` : ''}
                {row.ends} ends · {row.arrows} arrows{row.ends > 0 ? ` · ${row.points} points` : ''}
              </Text>
            </View>
          </Link>
        ))}
      </Screen>
    </ScrollView>
  );
}
