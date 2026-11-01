import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

type Statement = { relation: string[]; target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] } };
const statements = JSON.parse(read('site/.well-known/assetlinks.json')) as Statement[];

test('assetlinks.json lists well-formed fingerprints for the app', () => {
  assert.ok(statements.length > 0);
  for (const s of statements) {
    assert.deepEqual(s.relation, ['delegate_permission/common.handle_all_urls']);
    assert.equal(s.target.namespace, 'android_app');
    assert.match(s.target.package_name, /^de\.fletchr\.app(\.dev)?$/);
    assert.ok(s.target.sha256_cert_fingerprints.length > 0);
    for (const f of s.target.sha256_cert_fingerprints) assert.match(f, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/, f);
  }
});

test('the manifest opens the app for invite and reset links', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  for (const path of ['/join/', '/reset/']) {
    assert.ok(manifest.includes(`android:host="fletchr.de" android:pathPrefix="${path}"`), path);
  }
  for (const host of ['join', 'reset']) assert.ok(manifest.includes(`android:scheme="@string/custom_url_scheme" android:host="${host}"`), host);
});

test('the website answers /reset/<code> with the reset page', () => {
  assert.match(read('site/.htaccess'), /RewriteRule \^reset\/\.\+\$ \/reset\/index\.html \[L\]/);
});
