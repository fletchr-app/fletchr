import { Link, useFocusEffect, useTheme } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ErrorText, Screen } from '@/components/form';
import type { components } from '@/lib/api-types';
import { useAuth } from '@/lib/auth';

type Bow = components['schemas']['Bow'];
type ArrowSet = components['schemas']['ArrowSet'];

export default function EquipmentScreenList() {
  const { colors } = useTheme();
  const { api } = useAuth();
  const [bows, setBows] = useState<Bow[]>([]);
  const [arrowSets, setArrowSets] = useState<ArrowSet[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        // The list also contains the equipment of archers you coach, so ask for your own.
        const me = (await api.GET('/api/me/')).data;
        if (!me) return setError('Could not load your data');
        const query = { owner: me.id };
        const [b, a] = await Promise.all([
          api.GET('/api/bows/', { params: { query } }),
          api.GET('/api/arrow-sets/', { params: { query } }),
        ]);
        setBows(b.data ?? []);
        setArrowSets(a.data ?? []);
        setError(b.data && a.data ? null : 'Could not load your equipment');
      })().catch(() => setError('Server not reachable'));
    }, [api]),
  );

  return (
    <ScrollView>
      <Screen>
        <ErrorText>{error}</ErrorText>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>Bows</Text>
        {bows.map((bow) => (
          <Row key={bow.id} href={`/equipment/bows/${bow.id}`} title={bow.name} detail={bow.type} item={bow} />
        ))}
        <Link href="/equipment/bows/new" style={{ color: colors.primary }}>
          Add a bow
        </Link>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', marginTop: 16 }}>Arrow sets</Text>
        {arrowSets.map((set) => (
          <Row
            key={set.id}
            href={`/equipment/arrow-sets/${set.id}`}
            title={set.name}
            detail={[set.shaft_model, set.spine].filter(Boolean).join(' ')}
            item={set}
          />
        ))}
        <Link href="/equipment/arrow-sets/new" style={{ color: colors.primary }}>
          Add an arrow set
        </Link>
      </Screen>
    </ScrollView>
  );
}

function Row({
  href,
  title,
  detail,
  item,
}: {
  href: `/equipment/${string}`;
  title: string;
  detail: string;
  item: { is_active?: boolean; revision_number: number };
}) {
  const { colors } = useTheme();
  return (
    <Link href={href} style={{ opacity: item.is_active === false ? 0.5 : 1 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>
          {title}
          {item.is_active === false ? ' (inactive)' : ''}
        </Text>
        <Text style={{ color: colors.text, opacity: 0.7 }}>
          {detail ? `${detail} · ` : ''}revision {item.revision_number}
        </Text>
      </View>
    </Link>
  );
}
