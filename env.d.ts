/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Default server address baked into the build; changeable per device in Settings. */
  readonly VITE_SERVER_URL?: string;
  /** Web client ID of the Google project (public, not a secret). Set only for the official server's app: without it there is no Google button. */
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
}

/** The app version from package.json, put in by Vite (vite.config.ts). */
declare const __APP_VERSION__: string;
