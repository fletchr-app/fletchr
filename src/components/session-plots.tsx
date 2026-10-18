import { useTheme } from 'expo-router';
import { Text, View } from 'react-native';

import { FaceView } from '@/components/face-view';
import { getFace } from '@/lib/faces';
import { describeCentre, spreadCm } from '@/lib/group';
import type { LogSession } from '@/lib/log-model';
import { blocksOf } from '@/lib/session-view';

/** For each distance and face of the session: where the arrows hit, and the group centre and spread. */
export function SessionPlots({ session }: { session: Pick<LogSession, 'ends'> }) {
  const { colors } = useTheme();
  const blocks = blocksOf(session).filter((b) => b.plotted.length > 0 || b.typed > 0);
  if (blocks.length === 0) return null;

  return (
    <View style={{ gap: 16 }}>
      {blocks.map((block) => {
        const face = getFace(block.face);
        if (!face) return null;
        const radius = face.rings.length > 0 ? face.rings[face.rings.length - 1].diameter_cm / 2 : 20;
        return (
          <View key={block.key} style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
              {Number(block.distance_m)} m · {face.name} · {block.plotted.length + block.typed} arrows
            </Text>
            {block.plotted.length > 0 && <FaceView face={face} shots={block.plotted} />}
            {block.groups.map(({ spot, group }) => (
              <Text key={spot} style={{ color: colors.text }}>
                {face.spots.length > 1 ? `Spot ${spot + 1}: ` : 'Group: '}
                centre {describeCentre(group, radius)} · spread {spreadCm(group, radius).toFixed(1)} cm ({group.n} {group.n === 1 ? 'arrow' : 'arrows'})
              </Text>
            ))}
            {block.typed > 0 && (
              <Text style={{ color: colors.text, opacity: 0.6 }}>
                {block.typed} {block.typed === 1 ? 'arrow was' : 'arrows were'} typed in and cannot be drawn.
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
