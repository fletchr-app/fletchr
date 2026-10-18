import { useTheme } from 'expo-router';
import { Text } from 'react-native';

import { Chips } from '@/components/form';
import type { Equipment } from '@/lib/log-model';

/** Choose the bow and arrow set from the copy of your equipment on this device. Arrows are offered once a bow is chosen. */
export function GearPicker({
  equipment,
  bowId,
  arrowSetId,
  onChange,
}: {
  equipment: Equipment;
  bowId: number | null;
  arrowSetId: number | null;
  onChange: (bowId: number | null, arrowSetId: number | null) => void;
}) {
  const { colors } = useTheme();
  if (equipment.bows.length === 0) {
    return (
      <Text style={{ color: colors.text, opacity: 0.6 }}>
        No bows on this device yet. Add them under Equipment, with a connection, and they will be here next time.
      </Text>
    );
  }
  const none = { value: '', label: 'None' };
  return (
    <>
      <Chips
        label="Bow"
        options={[none, ...equipment.bows.map((b) => ({ value: String(b.id), label: b.name }))]}
        value={bowId === null ? '' : String(bowId)}
        onChange={(v) => onChange(v === '' ? null : Number(v), v === '' ? null : arrowSetId)}
      />
      {bowId !== null && equipment.arrowSets.length > 0 && (
        <Chips
          label="Arrow set"
          options={[none, ...equipment.arrowSets.map((a) => ({ value: String(a.id), label: a.name }))]}
          value={arrowSetId === null ? '' : String(arrowSetId)}
          onChange={(v) => onChange(bowId, v === '' ? null : Number(v))}
        />
      )}
    </>
  );
}
