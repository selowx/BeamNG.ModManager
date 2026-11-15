import { Columns2, LayoutGrid, LayoutList, List } from 'lucide-react';
import { UI_TEXT } from '../i18n';
import type { LocalViewMode, RepoViewMode } from '../utils';

export interface ViewModeOption<T extends string> {
  id: T;
  label: string;
  icon: typeof List;
}

export const LOCAL_VIEW_OPTIONS: ViewModeOption<LocalViewMode>[] = [
  { id: 'compact', label: UI_TEXT.localViewCompact, icon: List },
  { id: 'detailed', label: UI_TEXT.localViewDetailed, icon: LayoutList },
  { id: 'cards', label: UI_TEXT.localViewCards, icon: LayoutGrid },
];

export const REPO_VIEW_OPTIONS: ViewModeOption<RepoViewMode>[] = [
  { id: 'list', label: UI_TEXT.viewListRows, icon: LayoutList },
  { id: 'compact', label: UI_TEXT.viewCompactCards, icon: LayoutGrid },
  { id: 'wide', label: UI_TEXT.viewWideCards, icon: Columns2 },
];
