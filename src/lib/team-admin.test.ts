import assert from 'node:assert/strict';
import { test } from 'vitest';

import { claimMessage, inviteMessage, roleChangeWarning, roleLabel, sortMembers, type TeamRole } from './team-admin.ts';

const roles: TeamRole[] = ['archer', 'coach', 'admin'];

test('no change, no warning; every real change has one', () => {
  for (const from of roles) {
    for (const to of roles) {
      const warning = roleChangeWarning(from, to);
      if (from === to) assert.equal(warning, null);
      else assert.ok(warning && warning.length > 20, `${from} -> ${to}`);
    }
  }
});

test('the warnings say what happens to visibility', () => {
  assert.match(roleChangeWarning('coach', 'archer')!, /visible to the coaches/);
  assert.match(roleChangeWarning('admin', 'archer')!, /visible to the coaches/);
  assert.match(roleChangeWarning('archer', 'coach')!, /stop being visible to the other coaches/);
  assert.match(roleChangeWarning('archer', 'coach')!, /also shoots/);
  assert.match(roleChangeWarning('archer', 'admin')!, /manage members and invites/);
  assert.match(roleChangeWarning('coach', 'admin')!, /change roles/);
  assert.match(roleChangeWarning('admin', 'coach')!, /no longer be able/);
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

test('the invite message has the team, the code and the date', () => {
  const text = inviteMessage('Archery Göttingen', 'AB12CD34EF', '2026-11-01T12:00:00Z', 'en-GB');
  assert.match(text, /Archery Göttingen/);
  assert.match(text, /AB12CD34EF/);
  assert.match(text, /1 November 2026/);
  assert.match(text, /I have an invite code/);
});

test('role names for display', () => {
  assert.deepEqual(['archer', 'coach', 'admin', 'x'].map(roleLabel), ['Archer', 'Coach', 'Admin', 'x']);
});

test('the claim message has the team, the code, the date and both ways to enter it', () => {
  const text = claimMessage('Archery Göttingen', 'AB12CD34EF', '2026-11-01T12:00:00Z', 'en-GB');
  assert.match(text, /Archery Göttingen/);
  assert.match(text, /AB12CD34EF/);
  assert.match(text, /1 November 2026/);
  assert.match(text, /I have an invite code/);
  assert.match(text, /Join another team/);
});
