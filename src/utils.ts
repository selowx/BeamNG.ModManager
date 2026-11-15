export type ActiveTab = 'repo' | 'local' | 'profiles' | 'settings';
export type LocalFilter = 'all' | 'active' | 'disabled' | 'pinned' | 'updates';
export type RepoViewMode = 'list' | 'compact' | 'wide';
export type LocalViewMode = 'compact' | 'detailed' | 'cards';
export type ModCategoryKey = 'vehicle' | 'terrain' | 'scenario' | 'app' | 'sound' | 'skin' | 'other';

export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(' ');
}

export const REPO_SUBSCRIBED_CATEGORY = {
  id: 'subscribed',
  label: 'Subscribed (My Mods)',
} as const;

export const REPO_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'vehicles.2', label: 'Vehicles' },
  { id: 'terrains-levels-maps.9', label: 'Terrains / Maps' },
  { id: 'scenarios.8', label: 'Scenarios' },
  { id: 'user-interface-apps.10', label: 'UI Apps' },
  { id: 'sounds.13', label: 'Sounds' },
  { id: 'mods-of-mods.7', label: 'Mods of Mods' },
  { id: 'skins.12', label: 'Skins' },
  { id: 'automation.16', label: 'Automation' },
] as const;

export const REPO_SORTS = [
  { id: 'last_update', label: 'Last Updated' },
  { id: 'download_count', label: 'Most Downloaded' },
  { id: 'rating_weighted', label: 'Highest Rated' },
  { id: 'resource_date', label: 'Newest Releases' },
] as const;

export function normalizeCategoryKey(category: string): ModCategoryKey {
  const key = (category || '').toLowerCase();
  if (key.includes('skin') || key.includes('livery') || key.includes('paint')) return 'skin';
  if (key.includes('scenario') || key.includes('mission') || key.includes('campaign')) return 'scenario';
  if (key.includes('terrain') || key.includes('level') || key.includes('map')) return 'terrain';
  if (key.includes('vehicle') || key.includes('car') || key.includes('truck') || key.includes('automation')) return 'vehicle';
  if (key.includes('app') || key.includes('interface') || key.includes('ui')) return 'app';
  if (key.includes('sound') || key.includes('audio')) return 'sound';
  return 'other';
}

export function matchesCategory(modCategory: string, catId: string): boolean {
  if (catId === 'all') return true;
  return normalizeCategoryKey(modCategory) === catId;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i >= 2 ? 1 : 0)} ${units[i]}`;
}

export function formatEta(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins < 60) return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${(mins % 60).toString().padStart(2, '0')}m`;
}
