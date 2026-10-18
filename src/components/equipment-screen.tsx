import { router, useLocalSearchParams, useTheme } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';

import { Button, Chips, ErrorText, Field, Screen } from '@/components/form';
import type { FieldSpec } from '@/lib/equipment-fields';

type Item = { id: number; is_active?: boolean; revision_number: number } & Record<string, unknown>;
type Revision = { id: number; number: number; created_at: string } & Record<string, unknown>;
type Values = Record<string, string>;

/** What the screen needs from the API; each equipment kind supplies its own typed implementation. */
export type EquipmentAdapter = {
  load: (id: number) => Promise<Item | null>;
  revisions: (id: number) => Promise<Revision[]>;
  // Save and delete return an error message, or null on success.
  create: (payload: Record<string, unknown>) => Promise<string | null>;
  update: (id: number, payload: Record<string, unknown>) => Promise<string | null>;
  remove: (id: number) => Promise<string | null>;
};

const toText = (value: unknown) => (value == null ? '' : String(value));

function toPayload(fields: FieldSpec[], values: Values, isActive: boolean) {
  const payload: Record<string, unknown> = { is_active: isActive };
  for (const f of fields) {
    const v = values[f.key]?.trim() ?? '';
    if (f.kind === 'decimal') payload[f.key] = v === '' ? null : v.replace(',', '.');
    else if (f.kind === 'integer') payload[f.key] = v === '' ? null : Number(v);
    else payload[f.key] = v;
  }
  return payload;
}

export function EquipmentScreen({
  label,
  fields,
  adapter,
}: {
  label: string;
  fields: FieldSpec[];
  adapter: EquipmentAdapter;
}) {
  const { id: param } = useLocalSearchParams<{ id: string }>();
  const id = param === 'new' ? null : Number(param);
  const [state, setState] = useState<{ item: Item | null; revisions: Revision[] } | 'loading' | 'failed'>(
    id === null ? { item: null, revisions: [] } : 'loading',
  );

  useEffect(() => {
    if (id === null) return;
    Promise.all([adapter.load(id), adapter.revisions(id)])
      .then(([item, revisions]) => setState(item ? { item, revisions } : 'failed'))
      .catch(() => setState('failed'));
  }, [id, adapter]);

  if (state === 'loading') return <Screen><Text>Loading…</Text></Screen>;
  if (state === 'failed') return <Screen><ErrorText>{`Could not load this ${label}.`}</ErrorText></Screen>;
  return <EquipmentForm label={label} fields={fields} adapter={adapter} id={id} {...state} />;
}

function EquipmentForm({
  label,
  fields,
  adapter,
  id,
  item,
  revisions,
}: {
  label: string;
  fields: FieldSpec[];
  adapter: EquipmentAdapter;
  id: number | null;
  item: Item | null;
  revisions: Revision[];
}) {
  const { colors } = useTheme();
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(fields.map((f) => [f.key, toText(item?.[f.key])])),
  );
  const [isActive, setIsActive] = useState(item?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    try {
      const message = await action();
      if (message) setError(message);
      else router.back();
    } catch {
      setError('Server not reachable');
    }
    setBusy(false);
  }

  const save = () =>
    run(() => {
      const payload = toPayload(fields, values, isActive);
      return id === null ? adapter.create(payload) : adapter.update(id, payload);
    });

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <Screen>
        {fields.map((f) =>
          f.kind === 'choice' ? (
            <Chips
              key={f.key}
              label={f.label}
              options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
              value={values[f.key]}
              onChange={(option) => setValues((v) => ({ ...v, [f.key]: option }))}
            />
          ) : (
            <Field
              key={f.key}
              label={f.unit ? `${f.label} (${f.unit})` : f.label}
              value={values[f.key]}
              onChangeText={(text) => setValues((v) => ({ ...v, [f.key]: text }))}
              keyboardType={f.kind === 'decimal' ? 'decimal-pad' : f.kind === 'integer' ? 'number-pad' : 'default'}
              multiline={f.kind === 'multiline'}
              autoCapitalize={f.kind === 'text' || f.kind === 'multiline' ? 'sentences' : 'none'}
            />
          ),
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Switch value={isActive} onValueChange={setIsActive} />
          <Text style={{ color: colors.text }}>Active (shown when logging sessions)</Text>
        </View>
        <ErrorText>{error}</ErrorText>
        <Button title={id === null ? `Add ${label}` : 'Save'} onPress={save} busy={busy} />
        {id !== null && (
          <Button
            title={confirmDelete ? 'Tap again to delete' : 'Delete'}
            secondary
            onPress={() => (confirmDelete ? run(() => adapter.remove(id)) : setConfirmDelete(true))}
          />
        )}
        {revisions.length > 0 && <History fields={fields} revisions={revisions} />}
      </Screen>
    </ScrollView>
  );
}

function History({ fields, revisions }: { fields: FieldSpec[]; revisions: Revision[] }) {
  const { colors } = useTheme();
  // Newest first; each entry shows what changed compared with the revision before it.
  return (
    <View style={{ gap: 8, marginTop: 16 }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>History</Text>
      {revisions.map((rev, i) => {
        const prev = revisions[i + 1];
        const changes = prev
          ? fields
              .filter((f) => toText(rev[f.key]) !== toText(prev[f.key]))
              .map((f) => `${f.label}: ${toText(prev[f.key]) || '–'} → ${toText(rev[f.key]) || '–'}`)
          : ['created'];
        return (
          <View key={rev.id}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>
              #{rev.number} · {new Date(rev.created_at).toLocaleString()}
            </Text>
            {changes.map((c) => (
              <Text key={c} style={{ color: colors.text, opacity: 0.7 }}>
                {c}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}
