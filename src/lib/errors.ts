import { t } from '@/i18n';

// DRF errors look like {detail: "..."} or {field: ["..."]}.
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const parts = Object.values(error as Record<string, unknown>).flatMap((v) => (Array.isArray(v) ? v : [v]));
    const text = parts.filter((p) => typeof p === 'string').join(' ');
    if (text) return text;
  }
  return t('errors.generic');
}
