import { Link, useTheme } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Chips, ErrorText, Field } from '@/components/form';
import type { components } from '@/lib/api-types';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { useRemote } from '@/lib/use-remote';

type Note = components['schemas']['Note'];
type Visibility = 'coach_only' | 'shared';

const REFRESH_MS = 10000;
const always = () => true;
const VISIBILITY: { value: Visibility; label: string }[] = [
  { value: 'coach_only', label: 'Coach only' },
  { value: 'shared', label: 'Shared with the archer' },
];

/**
 * Coach notes about an archer, or about one of their sessions. Coaches see all notes of their team and can
 * write new ones (coach only unless they choose otherwise); an archer sees the notes shared with them.
 */
export function NotesSection({
  archerId,
  sessionId,
  ends = [],
}: {
  archerId: number;
  sessionId?: string;
  ends?: { id: string; index: number }[];
}) {
  const { colors } = useTheme();
  const { api } = useAuth();
  const [version, setVersion] = useState(0);

  const loadNotes = useCallback(
    async () => {
      void version; // a new version means: fetch again
      return (await api.GET('/api/notes/', { params: { query: { archer: archerId, session: sessionId } } })).data ?? null;
    },
    [api, archerId, sessionId, version],
  );
  const loadTeams = useCallback(
    async () => (await api.GET('/api/notes/teams/', { params: { query: { archer: archerId } } })).data ?? null,
    [api, archerId],
  );
  const notes = useRemote(loadNotes, REFRESH_MS, always);
  const teams = useRemote(loadTeams);
  const reload = () => setVersion((v) => v + 1);

  if (!notes.data?.length && !teams.data?.length) return null;
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>Coach notes</Text>
      <ErrorText>{notes.error}</ErrorText>
      {teams.data && teams.data.length > 0 && (
        <NewNote archerId={archerId} sessionId={sessionId} ends={ends} teams={teams.data} onAdded={reload} />
      )}
      {notes.data?.map((note) => (
        <NoteRow key={note.id} note={note} ends={ends} onChanged={reload} />
      ))}
    </View>
  );
}

function NewNote({
  archerId,
  sessionId,
  ends,
  teams,
  onAdded,
}: {
  archerId: number;
  sessionId?: string;
  ends: { id: string; index: number }[];
  teams: { id: number; name: string }[];
  onAdded: () => void;
}) {
  const { api } = useAuth();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('coach_only');
  const [endId, setEndId] = useState('');
  const [teamId, setTeamId] = useState(teams[0].id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await api.POST('/api/notes/', {
        body: { archer: archerId, team: teamId, body, visibility, session: sessionId ?? null, end: endId || null },
      });
      if (data) {
        setBody('');
        setEndId('');
        onAdded();
      } else setError(errorMessage(error));
    } catch {
      setError('Server not reachable');
    }
    setBusy(false);
  }

  return (
    <View style={{ gap: 8 }}>
      <Field label="New note" value={body} onChangeText={setBody} multiline autoCapitalize="sentences" />
      <Chips label="Who can read it" options={VISIBILITY} value={visibility} onChange={setVisibility} />
      {ends.length > 0 && (
        <Chips
          label="About"
          options={[{ value: '', label: 'Whole session' }, ...ends.map((e) => ({ value: e.id, label: `End ${e.index + 1}` }))]}
          value={endId}
          onChange={setEndId}
        />
      )}
      {teams.length > 1 && (
        <Chips label="Team" options={teams.map((t) => ({ value: String(t.id), label: t.name }))} value={String(teamId)} onChange={(v) => setTeamId(Number(v))} />
      )}
      <ErrorText>{error}</ErrorText>
      <Button title="Add note" onPress={add} busy={busy} />
    </View>
  );
}

function NoteRow({ note, ends, onChanged }: { note: Note; ends: { id: string; index: number }[]; onChanged: () => void }) {
  const { colors } = useTheme();
  const { api } = useAuth();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [visibility, setVisibility] = useState<Visibility>(note.visibility ?? 'coach_only');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: unknown }>) {
    setError(null);
    try {
      const result = await action();
      if (result.ok) {
        setEditing(false);
        onChanged();
      } else setError(errorMessage(result.error));
    } catch {
      setError('Server not reachable');
    }
  }
  const save = () =>
    run(async () => {
      const { data, error } = await api.PATCH('/api/notes/{id}/', { params: { path: { id: note.id } }, body: { body, visibility } });
      return { ok: !!data, error };
    });
  const remove = () =>
    run(async () => {
      const { response, error } = await api.DELETE('/api/notes/{id}/', { params: { path: { id: note.id } } });
      return { ok: response.ok, error };
    });

  const endIndex = ends.find((e) => e.id === note.end)?.index;
  return (
    <View style={{ gap: 4, paddingVertical: 4 }}>
      <Text style={{ color: colors.text, opacity: 0.7 }}>
        {note.author_name} · {new Date(note.created_at).toLocaleDateString()} ·{' '}
        {note.visibility === 'shared' ? 'shared' : 'coach only'}
        {endIndex !== undefined ? ` · end ${endIndex + 1}` : ''}
      </Text>
      {editing ? (
        <>
          <Field label="Note" value={body} onChangeText={setBody} multiline autoCapitalize="sentences" />
          <Chips label="Who can read it" options={VISIBILITY} value={visibility} onChange={setVisibility} />
          <Button title="Save" onPress={save} />
          <Button title="Cancel" onPress={() => setEditing(false)} secondary />
        </>
      ) : (
        <Text style={{ color: colors.text }}>{note.body}</Text>
      )}
      {note.session && !editing && <SessionLink id={note.session} />}
      <ErrorText>{error}</ErrorText>
      {!editing && (note.can_edit || note.can_delete) && (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {note.can_edit && (
            <Text style={{ color: colors.primary }} onPress={() => setEditing(true)}>
              Edit
            </Text>
          )}
          {note.can_delete && (
            <Text style={{ color: colors.primary }} onPress={() => (confirmDelete ? remove() : setConfirmDelete(true))}>
              {confirmDelete ? 'Tap again to delete' : 'Delete'}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

/** Notes about a session link to it, unless you are already looking at it. */
function SessionLink({ id }: { id: string }) {
  const { colors } = useTheme();
  return (
    <Link href={{ pathname: '/sessions/[id]', params: { id } }} style={{ color: colors.primary }}>
      About a session
    </Link>
  );
}
