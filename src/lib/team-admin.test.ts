import assert from 'node:assert/strict';
import { test } from 'vitest';

import { roleChangeWarning, sortMembers, type TeamRole, untilDate } from './team-admin.ts';

const roles: TeamRole[] = ['archer', 'coach', 'admin'];

test('no change, no warning; every real change has one', () => {
  for (const from of roles) {
    for (const to of roles) {
      const warning = roleChangeWarning(from, to);
      if (from === to) assert.equal(warning, null);
      else assert.match(warning!, /^roleChange\./, `${from} -> ${to}`);
    }
  }
});

test('each kind of change has its own text', () => {
  assert.equal(roleChangeWarning('coach', 'archer'), 'roleChange.toArcher');
  assert.equal(roleChangeWarning('admin', 'archer'), 'roleChange.toArcher');
  assert.equal(roleChangeWarning('archer', 'coach'), 'roleChange.archerToCoach');
  assert.equal(roleChangeWarning('archer', 'admin'), 'roleChange.archerToAdmin');
  assert.equal(roleChangeWarning('coach', 'admin'), 'roleChange.coachToAdmin');
  assert.equal(roleChangeWarning('admin', 'coach'), 'roleChange.adminToCoach');
});

test('members are sorted admins, coaches, archers, then by name', () => {
  const people = [
    { role: 'archer', name: 'Zoe', email: 'z@x' },
    { role: 'coach', name: 'bea', email: 'b@x' },
    { role: 'archer', name: '', email: 'anna@x' },
    { role: 'admin', name: 'Tim', email: 't@x' },
    { role: 'coach', name: 'Adam', email: 'a@x' },
  ];
  assert.deepEqual(sortMembers(people).map((p) => p.name || p.email), ['Tim', 'Adam', 'bea', 'anna@x', 'Zoe']);
  assert.equal(people[0].name, 'Zoe', 'the original list is untouched');
});

test('the date a code works until is written out in the reader\'s language', () => {
  assert.equal(untilDate('2026-11-01T12:00:00Z', 'en-GB'), '1 November 2026');
  assert.equal(untilDate('2026-11-01T12:00:00Z', 'de-DE'), '1. November 2026');
});
