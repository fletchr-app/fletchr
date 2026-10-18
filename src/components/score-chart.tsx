import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import type { components } from '@/lib/api-types';
import { scoreDomain } from '@/lib/chart';
import { useChartColors } from '@/lib/chart-theme';

type Group = components['schemas']['ScoreStats'];

const HEIGHT = 160;
const TOP = 12;
const AXIS = 22;
const LEFT = 30;
const RIGHT = 14;
const MAX_POINTS = 30;
const MARKERS_UP_TO = 12; // more points than this and only the touched and the latest one get a dot

const date = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const percent = (share: number) => `${Math.round(share * 100)}%`;

/**
 * How one face at one distance went: the average points per arrow in each session, as a line. A filled
 * dot is a practice session, a ring a competition. Each face and distance gets its own chart, because
 * points on different faces cannot be compared.
 */
export function ScoreChart({ group }: { group: Group }) {
  const c = useChartColors();
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const points = group.sessions.slice(-MAX_POINTS);
  const selected = Math.min(picked ?? points.length - 1, points.length - 1);
  const { lo, hi, ticks } = scoreDomain(points.map((p) => p.average), group.max_value);
  const plotH = HEIGHT - TOP - AXIS;
  const plotW = width - LEFT - RIGHT;
  const x = (i: number) => LEFT + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => TOP + plotH * (1 - (v - lo) / (hi - lo));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.average)}`).join(' ');
  const pick = points[selected];

  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12, gap: 8 }}>
      <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>
        {group.face_name} · {Number(group.distance_m)} m
      </Text>
      <Text style={{ color: c.secondary }}>
        {group.arrows} arrows · average {group.average.toFixed(2)} of {group.max_value}
      </Text>
      <Text style={{ color: c.secondary }}>
        Best ring {percent(group.top_rate)}
        {group.x_rate !== null && group.x_rate !== undefined ? ` · X ${percent(group.x_rate)}` : ''} · misses {percent(group.miss_rate)}
      </Text>
      {points.length > 0 && (
        <Text style={{ color: c.secondary }}>
          {date(pick.date)}: average {pick.average.toFixed(2)} · {pick.arrows} arrows{pick.competition ? ' · competition' : ''}
        </Text>
      )}
      {asTable ? (
        <View>
          {[...points].reverse().map((p) => (
            <View key={p.session} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
              <Text style={{ color: c.secondary }}>
                {date(p.date)}
                {p.competition ? ' (competition)' : ''} · {p.arrows} arrows
              </Text>
              <Text style={{ color: c.primary, fontVariant: ['tabular-nums'] }}>{p.average.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      ) : (
        points.length > 1 && (
          <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: HEIGHT }}>
            {width > 0 && (
              <>
                <Svg width={width} height={HEIGHT}>
                  {ticks.map((t) => (
                    <Line key={`g${t}`} x1={LEFT} x2={width - RIGHT} y1={y(t)} y2={y(t)} stroke={t === lo ? c.baseline : c.grid} strokeWidth={1} />
                  ))}
                  {ticks.map((t) => (
                    <SvgText key={`t${t}`} x={LEFT - 6} y={y(t) + 4} fontSize={11} fill={c.muted} textAnchor="end">
                      {t}
                    </SvgText>
                  ))}
                  <Path d={line} fill="none" stroke={c.series} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {points.map((p, i) => {
                    if (points.length > MARKERS_UP_TO && i !== selected && i !== points.length - 1) return null;
                    return (
                      <G key={p.session}>
                        <Circle cx={x(i)} cy={y(p.average)} r={6} fill={c.surface} />
                        <Circle
                          cx={x(i)}
                          cy={y(p.average)}
                          r={p.competition ? 3 : 4}
                          fill={p.competition ? c.surface : c.series}
                          stroke={c.series}
                          strokeWidth={p.competition ? 2 : 0}
                        />
                      </G>
                    );
                  })}
                  <SvgText x={LEFT} y={HEIGHT - 6} fontSize={11} fill={c.muted} textAnchor="start">
                    {date(points[0].date)}
                  </SvgText>
                  <SvgText x={width - RIGHT} y={HEIGHT - 6} fontSize={11} fill={c.muted} textAnchor="end">
                    {date(points[points.length - 1].date)}
                  </SvgText>
                </Svg>
                {points.map((p, i) => (
                  <Pressable
                    key={p.session}
                    onPress={() => setPicked(i)}
                    accessibilityLabel={`${date(p.date)}: average ${p.average.toFixed(2)}`}
                    style={{ position: 'absolute', left: x(i) - Math.max(12, plotW / points.length / 2), width: Math.max(24, plotW / points.length), top: TOP, height: plotH }}
                  />
                ))}
              </>
            )}
          </View>
        )
      )}
      {points.length === 1 && !asTable && <Text style={{ color: c.muted }}>One session so far: the line appears after the next one.</Text>}
      <Text style={{ color: c.muted }}>One point per session. A ring is a competition. The scale starts at {lo}, not at 0.</Text>
      <Pressable onPress={() => setAsTable((v) => !v)}>
        <Text style={{ color: c.series }}>{asTable ? 'Show as chart' : 'Show as table'}</Text>
      </Pressable>
    </View>
  );
}
