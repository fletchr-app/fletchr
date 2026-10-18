import { Link, useFocusEffect, useTheme } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Button, ErrorText, Screen } from '@/components/form';
import { LatestNotes } from '@/components/latest-notes';
import type { components } from '@/lib/api-types';
import { useAuth } from '@/lib/auth';

type Me = components['schemas']['Me'];
type Team = components['schemas']['Team'];

export default function HomeScreen() {
  const { colors } = useTheme();
  const { api, signOut } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reload when returning from the join screen.
  useFocusEffect(
    useCallback(() => {
      Promise.all([api.GET('/api/me/'), api.GET('/api/teams/')])
        .then(([meRes, teamsRes]) => {
          if (meRes.data) setMe(meRes.data);
          if (teamsRes.data) setTeams(teamsRes.data);
          setError(meRes.data && teamsRes.data ? null : 'Could not load your data');
        })
        .catch(() => setError('Server not reachable'));
    }, [api]),
  );

  return (
    <Screen>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '600' }}>
        {me ? `Hello ${me.profile.name || me.email}` : 'Archery Coach'}
      </Text>
      <ErrorText>{error}</ErrorText>
      {me && <LatestNotes userId={me.id} />}
      <Text style={{ color: colors.text, fontWeight: '600' }}>Your teams</Text>
      {teams?.length === 0 && <Text style={{ color: colors.text }}>You are not in a team yet.</Text>}
      {teams?.map((team) => (
        <View key={team.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.text }}>{team.name}</Text>
          <Text style={{ color: colors.text, opacity: 0.6 }}>{team.my_role}</Text>
        </View>
      ))}
      <Link href="/training" style={{ color: colors.primary, fontSize: 18, fontWeight: '600' }}>
        Training
      </Link>
      <Link href="/stats" style={{ color: colors.primary, fontSize: 18, fontWeight: '600' }}>
        Statistics
      </Link>
      {teams?.some((t) => t.my_role !== 'archer') && (
        <Link href="/team" style={{ color: colors.primary, fontSize: 18, fontWeight: '600' }}>
          Team (coach)
        </Link>
      )}
      <Link href="/equipment" style={{ color: colors.primary }}>
        My equipment
      </Link>
      <Link href="/join-team" style={{ color: colors.primary }}>
        Join another team
      </Link>
      <Link href="/privacy" style={{ color: colors.primary }}>
        Your data
      </Link>
      <Link href="/settings" style={{ color: colors.primary }}>
        Server settings
      </Link>
      <Button title="Sign out" onPress={signOut} secondary />
    </Screen>
  );
}
