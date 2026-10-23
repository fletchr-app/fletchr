import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';

import { systemLanguage } from '../composables/useLocale.ts';
import de from './de.ts';
import en from './en.ts';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') out[prefix + key] = value;
    else Object.assign(out, flatten(value, `${prefix}${key}.`));
  }
  return out;
}

const english = flatten(en as Tree);
const german = flatten(de as Tree);
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const forms = (text: string) => text.split(' | ').length;

test('English and German have the same texts', () => {
  assert.deepEqual(Object.keys(german).sort(), Object.keys(english).sort());
});

test('a German text has the same placeholders and plural forms as the English one', () => {
  for (const [key, text] of Object.entries(english)) {
    assert.deepEqual(placeholders(german[key]!), placeholders(text), `placeholders of ${key}`);
    assert.equal(forms(german[key]!), forms(text), `plural forms of ${key}`);
  }
});

test('no text is empty and German is not just a copy of English everywhere', () => {
  for (const [key, text] of Object.entries(german)) assert.ok(text.trim().length > 0, key);
  const same = Object.keys(english).filter((k) => german[k] === english[k] && /[a-z]{4}/.test(english[k]!));
  assert.ok(same.length < Object.keys(english).length / 8, `too many untranslated: ${same.slice(0, 8).join(', ')}`);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'locales' ? [] : sourceFiles(path);
    return /\.(vue|ts)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

test('every text the app asks for by a fixed key exists', () => {
  const missing: string[] = [];
  for (const file of sourceFiles(join(__dirname, '..'))) {
    const code = readFileSync(file, 'utf8');
    for (const match of code.matchAll(/(?:\$t|\bt)\(\s*'([A-Za-z][\w.]*)'/g)) {
      if (!(match[1]! in english)) missing.push(`${file.split('/src/')[1]}: ${match[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('the phone language picks the app language, English otherwise', () => {
  assert.equal(systemLanguage(['de-DE', 'en-US']), 'de');
  assert.equal(systemLanguage(['en-GB']), 'en');
  assert.equal(systemLanguage(['fr-FR', 'de-AT']), 'de'); // the first language we have
  assert.equal(systemLanguage(['fr-FR']), 'en');
  assert.equal(systemLanguage([]), 'en');
});
