import { useTheme } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, ErrorText, Field } from '@/components/form';
import { FACES, getFace } from '@/lib/faces';
import { useLog } from '@/lib/log';
import { endTotal, keypadFor, LogEnd, LogSession, LogShot, nextEndDefaults, shotLabel } from '@/lib/log-model';
import { newId } from '@/lib/uuid';

// Blank faces are for plotting positions, which is not built yet.
const SCORED_FACES = FACES.filter((f) => f.rings.length > 0);

/** One end: set distance, face and arrow count, tap in the scores, confirm. Uploads as soon as it is confirmed. */
export function EndEditor({
  session,
  editing,
  onDone,
}: {
  session: LogSession;
  editing: LogEnd | null;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const { saveEnd, deleteEnd } = useLog();
  const [start] = useState(() => editing ?? { ...nextEndDefaults(session), id: newId(), shots: [] as LogShot[] });
  const [distance, setDistance] = useState(start.distance_m);
  const [faceSlug, setFaceSlug] = useState(start.face);
  const [arrows, setArrows] = useState(String(start.arrows_per_end));
  const [shots, setShots] = useState<LogShot[]>(start.shots);
  const [pickingFace, setPickingFace] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const face = getFace(faceSlug) ?? SCORED_FACES[0];
  const arrowCount = Math.max(1, Math.min(12, Math.round(Number(arrows)) || 1));
  const full = shots.length >= arrowCount;

  function save() {
    const metres = Number(distance.replace(',', '.'));
    if (!(metres > 0)) return setError('Enter the distance in metres');
    if (!(Number(arrows) >= 1 && Number(arrows) <= 12)) return setError('Arrows per end must be between 1 and 12');
    if (shots.length === 0) return setError('Enter at least one arrow');
    if (shots.length > arrowCount) return setError('More arrows entered than arrows per end');
    saveEnd(session.id, {
      id: start.id,
      index: start.index,
      distance_m: metres.toFixed(1),
      face: face.slug,
      arrows_per_end: arrowCount,
      shots,
    });
    onDone();
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>
        {editing ? `Edit end ${start.index + 1}` : `End ${start.index + 1}`}
      </Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Distance (m)" value={distance} onChangeText={setDistance} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Arrows per end" value={arrows} onChangeText={setArrows} keyboardType="number-pad" />
        </View>
      </View>
      <Pressable onPress={() => setPickingFace((open) => !open)}>
        <Text style={{ color: colors.primary }}>Face: {face.name} {pickingFace ? '▴' : '▾'}</Text>
      </Pressable>
      {pickingFace &&
        SCORED_FACES.map((f) => (
          <Pressable
            key={f.slug}
            onPress={() => {
              if (f.slug !== face.slug) setShots([]); // scores from another face do not carry over
              setFaceSlug(f.slug);
              setPickingFace(false);
            }}>
            <Text style={{ color: colors.text, fontWeight: f.slug === face.slug ? '700' : '400', paddingVertical: 4 }}>{f.name}</Text>
          </Pressable>
        ))}

      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {Array.from({ length: arrowCount }, (_, i) => (
          <View
            key={i}
            style={{
              width: 44, height: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
              alignItems: 'center', justifyContent: 'center',
            }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>{shots[i] ? shotLabel(shots[i]) : ''}</Text>
          </View>
        ))}
        <View style={{ justifyContent: 'center', marginLeft: 8 }}>
          <Text style={{ color: colors.text, fontSize: 18 }}>= {endTotal({ ...start, shots })}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {keypadFor(face).map((key) => (
          <Pressable
            key={key.label}
            disabled={full}
            onPress={() => setShots((prev) => [...prev, { id: newId(), value: key.value, is_x: key.is_x, is_miss: key.is_miss }])}
            style={{
              width: 56, height: 56, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
              backgroundColor: colors.border, opacity: full ? 0.4 : 1,
            }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '600' }}>{key.label}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => setShots((prev) => prev.slice(0, -1))}
          style={{ width: 56, height: 56, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: 20 }}>⌫</Text>
        </Pressable>
      </View>

      <ErrorText>{error}</ErrorText>
      <Button title={editing ? 'Save end' : 'Confirm end'} onPress={save} />
      {editing && (
        <>
          <Button title="Cancel" onPress={onDone} secondary />
          <Button
            title="Delete end"
            secondary
            onPress={() => {
              deleteEnd(session.id, start.id);
              onDone();
            }}
          />
        </>
      )}
    </View>
  );
}
