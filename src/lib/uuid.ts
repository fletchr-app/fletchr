import { randomUUID } from 'expo-crypto';

/** Ids for sessions, ends and shots are made on the device, so they exist before the server has seen them. */
export const newId = (): string => randomUUID();
