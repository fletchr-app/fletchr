import Svg, { Circle, G, Line } from 'react-native-svg';

import type { Face } from '@/lib/faces';
import { ringFill, ringLine } from '@/lib/plot';
import { outerRadiusCm } from '@/lib/scoring';

export const MARKER_PX = 5;

export type View4 = { x: number; y: number; w: number; h: number };
export type Marker = { cx: number; cy: number; selected: boolean };
/** A group of arrows: its centre and mean radius, in cm in the drawing's orientation (y down). */
export type GroupMark = { cx: number; cy: number; r: number };

/** The face drawn in cm, looking at `view`. Used for the whole face and, zoomed in, for the magnifier. */
export function FaceSvg({
  face,
  view,
  width,
  height,
  cmPerPx,
  markers,
  groups = [],
}: {
  face: Face;
  view: View4;
  width: number;
  height: number;
  cmPerPx: number;
  markers: Marker[];
  groups?: GroupMark[];
}) {
  const line = cmPerPx;
  const markerR = MARKER_PX * cmPerPx;
  const radius = outerRadiusCm(face);
  return (
    <Svg width={width} height={height} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}>
      {face.spots.map((spot, i) => (
        <G key={i}>
          {face.rings.length === 0 ? (
            <>
              <Circle cx={spot.x} cy={-spot.y} r={radius} fill="#f2f2f2" stroke="#1c1c1c" strokeWidth={line} />
              <Line x1={spot.x - radius} y1={-spot.y} x2={spot.x + radius} y2={-spot.y} stroke="#bbb" strokeWidth={line} />
              <Line x1={spot.x} y1={-spot.y - radius} x2={spot.x} y2={-spot.y + radius} stroke="#bbb" strokeWidth={line} />
            </>
          ) : (
            [...face.rings].reverse().map((ring) => {
              const fill = ringFill(face, ring.value);
              return <Circle key={ring.value} cx={spot.x} cy={-spot.y} r={ring.diameter_cm / 2} fill={fill} stroke={ringLine(fill)} strokeWidth={line} />;
            })
          )}
          {face.x_diameter_cm ? (
            <Circle cx={spot.x} cy={-spot.y} r={face.x_diameter_cm / 2} fill="none" stroke="#1c1c1c" strokeWidth={line} />
          ) : null}
        </G>
      ))}
      {markers.map((m, i) => (
        <G key={i}>
          {m.selected && <Circle cx={m.cx} cy={m.cy} r={markerR * 2} fill="none" stroke="#ff00ff" strokeWidth={line * 2} />}
          <Circle cx={m.cx} cy={m.cy} r={markerR} fill="#00e676" stroke="#000" strokeWidth={line * 1.5} />
        </G>
      ))}
      {groups.map((g, i) => (
        <G key={`group-${i}`}>
          {g.r > 0 && <Circle cx={g.cx} cy={g.cy} r={g.r} fill="none" stroke="#ff00ff" strokeWidth={line * 2} strokeDasharray={`${line * 6} ${line * 4}`} />}
          <Line x1={g.cx - markerR * 2} y1={g.cy} x2={g.cx + markerR * 2} y2={g.cy} stroke="#ff00ff" strokeWidth={line * 2} />
          <Line x1={g.cx} y1={g.cy - markerR * 2} x2={g.cx} y2={g.cy + markerR * 2} stroke="#ff00ff" strokeWidth={line * 2} />
        </G>
      ))}
    </Svg>
  );
}
