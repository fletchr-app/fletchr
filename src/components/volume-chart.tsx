import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { columnPath, compact, niceTicks } from '@/lib/chart';
import { useChartColors } from '@/lib/chart-theme';

const HEIGHT = 190;
const TOP = 24; // room for the value above the tallest column
const AXIS = 22;
const LEFT = 36;
const RIGHT = 8;
const MAX_BAR = 24;

type Week = { week_start: string; arrows: number };

const date = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/** Arrows per week as columns. Touch a column to read its value; the table view has all of them. */
export function VolumeChart({ weeks }: { weeks: Week[] }) {
  const c = useChartColors();
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const selected = picked ?? weeks.length - 1;

  const plotH = HEIGHT - TOP - AXIS;
  const { max, ticks } = niceTicks(Math.max(...weeks.map((w) => w.arrows)));
  const slot = (width - LEFT - RIGHT) / weeks.length;
  const barWidth = Math.max(2, Math.min(MAX_BAR, slot - 4));
  const y = (v: number) => TOP + plotH * (1 - v / max);
  const baseline = TOP + plotH;

  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12, gap: 8 }}>
      <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>Arrows per week</Text>
      <Text style={{ color: c.secondary }}>
        Week of {date(weeks[selected].week_start)}: {weeks[selected].arrows} arrows
      </Text>
      {asTable ? (
        <View>
          {[...weeks].reverse().map((w) => (
            <View key={w.week_start} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
              <Text style={{ color: c.secondary }}>Week of {date(w.week_start)}</Text>
              <Text style={{ color: c.primary, fontVariant: ['tabular-nums'] }}>{w.arrows}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: HEIGHT }}>
          {width > 0 && (
            <>
              <Svg width={width} height={HEIGHT}>
                {ticks.map((t) => (
                  <Line key={`g${t}`} x1={LEFT} x2={width - RIGHT} y1={y(t)} y2={y(t)} stroke={t === 0 ? c.baseline : c.grid} strokeWidth={1} />
                ))}
                {ticks.map((t) => (
                  <SvgText key={`t${t}`} x={LEFT - 6} y={y(t) + 4} fontSize={11} fill={c.muted} textAnchor="end">
                    {compact(t)}
                  </SvgText>
                ))}
                {weeks.map((w, i) => {
                  const x = LEFT + i * slot + (slot - barWidth) / 2;
                  const h = (w.arrows / max) * plotH;
                  return h > 0 ? <Path key={w.week_start} d={columnPath(x, baseline, barWidth, h)} fill={c.series} /> : null;
                })}
                {/* The value on the cap of the touched column (the latest one until then), not on every column. */}
                <SvgText
                  x={LEFT + selected * slot + slot / 2}
                  y={y(weeks[selected].arrows) - 6}
                  fontSize={12}
                  fontWeight="600"
                  fill={c.primary}
                  textAnchor="middle">
                  {weeks[selected].arrows}
                </SvgText>
                {weeks.map((w, i) =>
                  (weeks.length - 1 - i) % 2 === 0 ? (
                    <SvgText key={`x${w.week_start}`} x={LEFT + i * slot + slot / 2} y={HEIGHT - 6} fontSize={11} fill={c.muted} textAnchor="middle">
                      {date(w.week_start)}
                    </SvgText>
                  ) : null,
                )}
              </Svg>
              {/* Touch areas: the whole column slot, wider than the thin column itself. */}
              {weeks.map((w, i) => (
                <Pressable
                  key={w.week_start}
                  onPress={() => setPicked(i)}
                  accessibilityLabel={`Week of ${date(w.week_start)}: ${w.arrows} arrows`}
                  style={{ position: 'absolute', left: LEFT + i * slot, width: slot, top: TOP, height: plotH }}
                />
              ))}
            </>
          )}
        </View>
      )}
      <Pressable onPress={() => setAsTable((v) => !v)}>
        <Text style={{ color: c.series }}>{asTable ? 'Show as chart' : 'Show as table'}</Text>
      </Pressable>
    </View>
  );
}
