// Metric or imperial for what the app shows: distances in metres or yards, group sizes in cm or inches.
// Everything is stored in metres and centimetres; this only converts for the screen and for what is typed.
export type Units = 'metric' | 'imperial';

const METRES_PER_YARD = 0.9144;
const CM_PER_INCH = 2.54;

export const isUnits = (value: unknown): value is Units => value === 'metric' || value === 'imperial';
export const distanceUnit = (units: Units) => (units === 'imperial' ? 'yd' : 'm');

/** The number as it is shown: whole yards, metres with a decimal only when there is one (18, 22.5). */
export function distanceValue(metres: number, units: Units): number {
  return units === 'imperial' ? Math.round(metres / METRES_PER_YARD) : Math.round(metres * 10) / 10;
}

/** "18 m" or "20 yd". */
export const formatDistance = (metres: number | string, units: Units) => `${distanceValue(Number(metres), units)} ${distanceUnit(units)}`;

/** The distance as it is put into a text field. */
export const distanceField = (metres: number | string, units: Units) => String(distanceValue(Number(metres), units));

/** What was typed, in metres; null when it is not a positive number. A comma works as the decimal mark. */
export function parseDistance(text: string, units: Units): number | null {
  const typed = Number(text.trim().replace(',', '.'));
  if (!(typed > 0)) return null;
  const metres = units === 'imperial' ? typed * METRES_PER_YARD : typed;
  return Math.round(metres * 10) / 10;
}

/** A length in cm as it is shown: "3.8 cm" or "1.5 in". */
export function formatLength(cm: number, units: Units): string {
  return units === 'imperial' ? `${(cm / CM_PER_INCH).toFixed(1)} in` : `${cm.toFixed(1)} cm`;
}
