import { useCallback, useState } from 'react';
import type { LocalViewMode, RepoViewMode } from '../utils';

const REPO_VIEW_KEY = 'modmanager_repo_view_mode';
const LOCAL_VIEW_KEY = 'modmanager_local_view_mode';

function readInitialRepoViewMode(): RepoViewMode {
  const saved = localStorage.getItem(REPO_VIEW_KEY);
  if (saved === 'list' || saved === 'compact' || saved === 'wide') return saved;
  if (saved === 'large') {
    localStorage.setItem(REPO_VIEW_KEY, 'wide');
    return 'wide';
  }
  if (saved === 'detailed') {
    localStorage.setItem(REPO_VIEW_KEY, 'compact');
    return 'compact';
  }
  return 'compact';
}

function readInitialLocalViewMode(): LocalViewMode {
  const saved = localStorage.getItem(LOCAL_VIEW_KEY);
  return saved === 'compact' || saved === 'detailed' || saved === 'cards' ? saved : 'compact';
}

export function useViewPreferences() {
  const [repoViewMode, setRepoViewModeState] = useState<RepoViewMode>(readInitialRepoViewMode);
  const [localViewMode, setLocalViewModeState] = useState<LocalViewMode>(readInitialLocalViewMode);

  const setRepoViewMode = useCallback((mode: RepoViewMode) => {
    setRepoViewModeState(mode);
    localStorage.setItem(REPO_VIEW_KEY, mode);
  }, []);

  const setLocalViewMode = useCallback((mode: LocalViewMode) => {
    setLocalViewModeState(mode);
    localStorage.setItem(LOCAL_VIEW_KEY, mode);
  }, []);

  return {
    repoViewMode,
    setRepoViewMode,
    localViewMode,
    setLocalViewMode,
  };
}
