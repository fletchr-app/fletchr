/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Default server address baked into the build; changeable per device in Settings. */
  readonly VITE_SERVER_URL?: string;
}
