export type FieldSpec = {
  key: string;
  label: string;
  kind: 'text' | 'multiline' | 'decimal' | 'integer' | 'choice';
  unit?: string;
  options?: string[];
};

export const BOW_FIELDS: FieldSpec[] = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'type', label: 'Type', kind: 'choice', options: ['recurve', 'compound', 'barebow', 'longbow', 'traditional'] },
  { key: 'riser', label: 'Riser', kind: 'text' },
  { key: 'limbs', label: 'Limbs', kind: 'text' },
  { key: 'draw_weight', label: 'Draw weight', kind: 'decimal', unit: 'lb' },
  { key: 'draw_length', label: 'Draw length', kind: 'decimal', unit: 'in' },
  { key: 'brace_height', label: 'Brace height', kind: 'decimal', unit: 'mm' },
  { key: 'tiller', label: 'Tiller (top minus bottom)', kind: 'decimal', unit: 'mm' },
  { key: 'plunger', label: 'Plunger', kind: 'text' },
  { key: 'sight', label: 'Sight', kind: 'text' },
  { key: 'stabilisers', label: 'Stabilisers', kind: 'text' },
  { key: 'release_tab', label: 'Release / tab', kind: 'text' },
  { key: 'notes', label: 'Notes', kind: 'multiline' },
];

export const ARROW_SET_FIELDS: FieldSpec[] = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'shaft_model', label: 'Shaft model', kind: 'text' },
  { key: 'spine', label: 'Spine', kind: 'text' },
  { key: 'length', label: 'Length', kind: 'decimal', unit: 'in' },
  { key: 'point_weight', label: 'Point weight', kind: 'integer', unit: 'grain' },
  { key: 'nock', label: 'Nock', kind: 'text' },
  { key: 'fletching', label: 'Fletching', kind: 'text' },
  { key: 'count', label: 'Number of arrows', kind: 'integer' },
  { key: 'notes', label: 'Notes', kind: 'multiline' },
];

/** The values of a new item: empty, except a choice (the bow's type), which always needs one: the first is selected. */
export function emptyValues(fields: FieldSpec[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, f.kind === 'choice' ? (f.options?.[0] ?? '') : '']));
}
