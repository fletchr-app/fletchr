import { useTheme } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { getFace } from '@/lib/faces';
import { endTotal, LogEnd, shotLabel, sortedShots } from '@/lib/log-model';

/** The ends of a session, newest first, each with its arrows best first and its total. */
export function EndRows({ ends, onPress }: { ends: LogEnd[]; onPress?: (end: LogEnd) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {[...ends].reverse().map((end) => (
        <Pressable key={end.id} disabled={!onPress} onPress={() => onPress?.(end)}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>
            End {end.index + 1} · {sortedShots(end.shots).map(shotLabel).join(' ')} = {endTotal(end)}
          </Text>
          <Text style={{ color: colors.text, opacity: 0.6 }}>
            {end.distance_m} m · {getFace(end.face)?.name ?? end.face}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
