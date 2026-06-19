/** Returns true when the app is running inside a Tauri desktop shell. */
export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
