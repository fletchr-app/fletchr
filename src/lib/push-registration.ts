export type RegistrationFacts = {
  /** Built with Firebase, on a phone, for the official server, which has a key. */
  available: boolean;
  signedIn: boolean;
  /** The notification permission was given (always true below Android 13). */
  granted: boolean;
};

/** Whether this phone should be known to the server. */
export function shouldRegister(facts: RegistrationFacts): boolean {
  return facts.available && facts.signedIn && facts.granted;
}

/** The body of `PUT /api/devices/`. `replaces` is the token the phone had before, when Firebase gave it a new one. */
export function registrationBody(token: string, previous: string | null, appId: string, language: string) {
  return { token, app_id: appId, language, ...(previous && previous !== token ? { replaces: previous } : {}) };
}
