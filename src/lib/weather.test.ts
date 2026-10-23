import assert from 'node:assert/strict';
import { test } from 'vitest';

import { decodeWeather, describeWeather, encodeWeather } from './weather.ts';

test('chips and details are stored as one short text and read back', () => {
  assert.equal(encodeWeather({ tokens: ['wind', 'sunny'], text: ' 15 °C ' }), 'sunny,wind;15 °C');
  assert.deepEqual(decodeWeather('sunny,wind;15 °C'), { tokens: ['sunny', 'wind'], text: '15 °C' });
});

test('only chips, only details, nothing', () => {
  assert.equal(encodeWeather({ tokens: ['rain'], text: '' }), 'rain');
  assert.deepEqual(decodeWeather('rain'), { tokens: ['rain'], text: '' });
  assert.equal(encodeWeather({ tokens: [], text: 'rain' }), ';rain'); // typed words stay details, not a chip
  assert.deepEqual(decodeWeather(';rain'), { tokens: [], text: 'rain' });
  assert.equal(encodeWeather({ tokens: [], text: '' }), '');
  assert.deepEqual(decodeWeather(''), { tokens: [], text: '' });
});

test('text from somewhere else is kept as the details', () => {
  assert.deepEqual(decodeWeather('Sonne; 20 Grad'), { tokens: [], text: 'Sonne; 20 Grad' });
  assert.deepEqual(decodeWeather('cloudy and cold'), { tokens: [], text: 'cloudy and cold' });
});

test('the chips are shown in the reader\'s words', () => {
  const de = { sunny: 'Sonnig', cloudy: 'Bewölkt', rain: 'Regen', wind: 'Windig' };
  assert.equal(describeWeather('sunny,wind;15 °C', (t) => de[t]), 'Sonnig, Windig · 15 °C');
  assert.equal(describeWeather(';15 °C', (t) => de[t]), '15 °C');
  assert.equal(describeWeather('', (t) => de[t]), '');
});
