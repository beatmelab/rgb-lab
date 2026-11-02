export type SimulationMode = 'basic' | 'fixture' | 'surfaces';
export const MODE_STORAGE_KEY = 'rgb-lab:mode';
type ModeStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function loadMode(storage?: ModeStorage): SimulationMode {
  try {
    const value = (storage ?? localStorage).getItem(MODE_STORAGE_KEY);
    return value === 'fixture' || value === 'surfaces' || value === 'basic' ? value : 'basic';
  } catch {
    return 'basic';
  }
}

export function saveMode(mode: SimulationMode, storage?: ModeStorage): void {
  try { (storage ?? localStorage).setItem(MODE_STORAGE_KEY, mode); }
  catch { /* Storage restrictions must not prevent changing the view. */ }
}
