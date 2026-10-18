import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth';
import {
  EMPTY_LOG,
  Environment,
  Equipment,
  Gear,
  LogAction,
  LogEnd,
  LogSession,
  LogState,
  LogVolume,
  Op,
  reduce,
  SessionType,
} from '@/lib/log-model';
import { drain, fetchEquipment, send } from '@/lib/log-sync';
import { useServer } from '@/lib/server';
import { newId } from '@/lib/uuid';

const RETRY_INTERVAL_MS = 20_000;

type LogContextValue = {
  loaded: boolean;
  sessions: LogSession[];
  waiting: number;
  failed: Op[];
  equipment: Equipment;
  refreshEquipment: () => Promise<void>;
  startSession: (type: SessionType, environment: Environment, location: string, gear?: Gear) => string;
  setGear: (id: string, gear: Gear) => void;
  finishSession: (id: string, finished: boolean) => void;
  deleteSession: (id: string) => void;
  saveEnd: (sessionId: string, end: LogEnd) => void;
  deleteEnd: (sessionId: string, endId: string) => void;
  saveVolume: (sessionId: string, entry: LogVolume) => void;
  deleteVolume: (sessionId: string, entryId: string) => void;
  retryFailed: () => void;
  discardFailed: () => void;
};

const LogContext = createContext<LogContextValue | null>(null);

export function LogProvider({ children }: { children: ReactNode }) {
  const { api, userId, status } = useAuth();
  const { url } = useServer();
  // Each user on each server has their own local log.
  const storageKey = userId !== null ? `log:${url}:${userId}` : null;

  const [state, setState] = useState<LogState>(EMPTY_LOG);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  // The ref is the current truth, so the upload loop sees its own updates immediately.
  const current = useRef<LogState>(EMPTY_LOG);
  const flushing = useRef(false);

  const dispatch = useCallback((action: LogAction) => {
    current.current = reduce(current.current, action);
    setState(current.current);
  }, []);

  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((raw) => (raw ? (JSON.parse(raw) as LogState) : EMPTY_LOG))
      .catch(() => EMPTY_LOG)
      .then((loaded) => {
        if (cancelled) return;
        dispatch({ type: 'load', state: loaded });
        setLoadedKey(storageKey);
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey, dispatch]);

  const loaded = storageKey !== null && loadedKey === storageKey;

  useEffect(() => {
    if (loaded && storageKey) AsyncStorage.setItem(storageKey, JSON.stringify(state)).catch(() => {});
  }, [state, loaded, storageKey]);

  const flush = useCallback(async () => {
    if (flushing.current || !loaded || status !== 'signedIn') return;
    flushing.current = true;
    try {
      await drain(() => current.current, dispatch, (state, op) => send(api, state, op));
    } finally {
      flushing.current = false;
    }
  }, [api, loaded, status, dispatch]);

  // Your equipment is copied to the device whenever it is online, so a session can start at the range without a connection.
  const refreshEquipment = useCallback(async () => {
    if (!loaded || status !== 'signedIn' || userId === null) return;
    const equipment = await fetchEquipment(api, Number(userId));
    if (equipment) dispatch({ type: 'setEquipment', equipment });
  }, [api, loaded, status, userId, dispatch]);
  useEffect(() => {
    void refreshEquipment();
  }, [refreshEquipment]);

  const waiting = state.outbox.filter((o) => !o.error).length;
  const failed = useMemo(() => state.outbox.filter((o) => o.error), [state.outbox]);

  // Upload whenever something new is queued, again every so often while something is waiting, and on return to the app.
  useEffect(() => {
    void flush();
  }, [flush, state.outbox]);
  useEffect(() => {
    if (waiting === 0) return;
    const timer = setInterval(() => void flush(), RETRY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [flush, waiting]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => next === 'active' && void flush());
    return () => sub.remove();
  }, [flush]);

  const value = useMemo<LogContextValue>(
    () => ({
      loaded,
      sessions: loaded ? state.sessions : [],
      equipment: state.equipment,
      refreshEquipment,
      waiting,
      failed,
      startSession: (type, environment, location, gear) => {
        const id = newId();
        dispatch({
          type: 'startSession',
          session: {
            id, started_at: new Date().toISOString(), ended_at: null, type, environment, location, ends: [], volume: [],
            ...(gear ? { gear } : {}),
          },
        });
        return id;
      },
      setGear: (id, gear) => dispatch({ type: 'updateSession', id, patch: { gear } }),
      finishSession: (id, finished) =>
        dispatch({ type: 'updateSession', id, patch: { ended_at: finished ? new Date().toISOString() : null } }),
      deleteSession: (id) => dispatch({ type: 'deleteSession', id }),
      saveEnd: (sessionId, end) => dispatch({ type: 'saveEnd', sessionId, end }),
      deleteEnd: (sessionId, endId) => dispatch({ type: 'deleteEnd', sessionId, endId }),
      saveVolume: (sessionId, entry) => dispatch({ type: 'saveVolume', sessionId, entry }),
      deleteVolume: (sessionId, entryId) => dispatch({ type: 'deleteVolume', sessionId, entryId }),
      retryFailed: () => {
        dispatch({ type: 'retryFailed' });
        void flush();
      },
      discardFailed: () => dispatch({ type: 'discardFailed' }),
    }),
    [loaded, state.sessions, state.equipment, refreshEquipment, waiting, failed, dispatch, flush],
  );
  return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
}

export function useLog() {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error('useLog must be used inside LogProvider');
  return ctx;
}
