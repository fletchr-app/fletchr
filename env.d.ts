/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Default server address baked into the build; changeable per device in Settings. */
  readonly VITE_SERVER_URL?: string;
  /** Set for the build that has the video prototype page (#35). */
  readonly VITE_PROTOTYPE?: string;
}

/** The app version from package.json, put in by Vite (vite.config.ts). */
declare const __APP_VERSION__: string;
