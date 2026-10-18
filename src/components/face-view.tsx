import { useState } from 'react';
import { View } from 'react-native';

import { FaceSvg, type GroupMark, type Marker } from '@/components/face-svg';
import type { Face } from '@/lib/faces';
import { groupOf } from '@/lib/group';
import type { LogShot } from '@/lib/log-model';
import { fitScale, sceneOf } from '@/lib/plot';

const MAX_HEIGHT_PX = 380;

/** The face with the arrows that have a position, and for each spot the centre and spread of its group. Read-only. */
export function FaceView({ face, shots }: { face: Face; shots: LogShot[] }) {
  const [boxWidth, setBoxWidth] = useState(0);
  const scene = sceneOf(face);
  const scale = boxWidth > 0 ? fitScale(scene, boxWidth, MAX_HEIGHT_PX) : 1;

  const at = (spot: number, x: number, y: number) => {
    const s = face.spots[Math.min(spot, face.spots.length - 1)];
    return { cx: s.x + x * scene.radius, cy: -(s.y + y * scene.radius) };
  };
  const plotted = shots.flatMap((s) => (s.x === undefined || s.y === undefined ? [] : [{ ...s, x: s.x, y: s.y }]));
  const markers: Marker[] = plotted.map((s) => ({ ...at(s.spot ?? 0, s.x, s.y), selected: false }));
  const groups: GroupMark[] = face.spots.flatMap((_, spot) => {
    const group = groupOf(plotted.filter((s) => (s.spot ?? 0) === spot));
    return group ? [{ ...at(spot, group.cx, group.cy), r: group.meanRadius * scene.radius }] : [];
  });

  return (
    <View onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)} style={{ width: '100%', alignItems: 'center' }}>
      {boxWidth > 0 && (
        <FaceSvg
          face={face}
          view={{ x: scene.x0, y: scene.y0, w: scene.width, h: scene.height }}
          width={scene.width * scale}
          height={scene.height * scale}
          cmPerPx={1 / scale}
          markers={markers}
          groups={groups}
        />
      )}
    </View>
  );
}
