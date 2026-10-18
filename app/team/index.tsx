import { Link, useTheme } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ErrorText, Screen } from '@/components/form';
import type { components } from '@/lib/api-types';
import { useAuth } from '@/lib/auth';
import { useRemote } from '@/lib/use-remote';

const REFRESH_MS = 10000;
const always = () => true;

type Team = components['schemas']['Team'];

export default function TeamScreen() {
  const { colors } = useTheme();
  const { api } = useAuth();
  const load = useCallback(async () => (await api.GET('/api/teams/')).data ?? null, [api]);
  const { data, error } = useRemote(load);
  const coached = (data ?? []).filter((t) => t.my_role !== 'archer');

  return (
    <ScrollView>
      <Screen>
        <ErrorText>{error}</ErrorText>
        {data && coached.length === 0 && <Text style={{ color: colors.text }}>You are not a coach in any team.</Text>}
        {coached.map((team) => (
          <TeamOverview key={team.id} team={team} />
        ))}
      </Screen>
    </ScrollView>
  );
}

function TeamOverview({ team }: { team: Team }) {
  const { colors } = useTheme();
  const { api } = useAuth();
  const load = useCallback(
    async () => (await api.GET('/api/teams/{team_id}/overview/', { params: { path: { team_id: team.id } } })).data ?? null,
    [api, team.id],
  );
  const { data, error } = useRemote(load, REFRESH_MS, always);

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '600' }}>{team.name}</Text>
      <ErrorText>{error}</ErrorText>
      {data?.length === 0 && <Text style={{ color: colors.text }}>No archers in this team yet.</Text>}
      {data?.map((archer) => (
        <Link key={archer.user_id} href={{ pathname: '/archers/[id]', params: { id: String(archer.user_id), name: archer.name } }}>
          <View style={{ gap: 2 }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>
              {archer.name}
              {archer.last_session?.live ? '  ● shooting now' : ''}
            </Text>
            <Text style={{ color: colors.text, opacity: 0.7 }}>
              {archer.last_session
                ? `Last session ${new Date(archer.last_session.started_at).toLocaleDateString()} · ${archer.last_session.type}`
                : 'No sessions yet'}
              {' · '}
              {archer.arrows_7d} arrows in 7 days
            </Text>
          </View>
        </Link>
      ))}
    </View>
  );
}
