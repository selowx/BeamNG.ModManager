import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { BeamNGConfig, LaunchMode } from '../types';

interface UseGameLauncherOptions {
  config: BeamNGConfig | null;
  setConfig: React.Dispatch<React.SetStateAction<BeamNGConfig | null>>;
  showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export function useGameLauncher({ config, setConfig, showToast }: UseGameLauncherOptions) {
  const [launchMode, setLaunchMode] = useState<LaunchMode>(() =>
    localStorage.getItem('modmanager_launch_mode') === 'direct' ? 'direct' : 'steam'
  );
  const [launchingGame, setLaunchingGame] = useState(false);
  const launchingRef = useRef(false);

  const selectLaunchMode = useCallback((mode: LaunchMode) => {
    setLaunchMode(mode);
    localStorage.setItem('modmanager_launch_mode', mode);
  }, []);

  useEffect(() => {
    if (config?.gameRunning && (launchingGame || launchingRef.current)) {
      launchingRef.current = false;
      setLaunchingGame(false);
    }
  }, [config?.gameRunning, launchingGame]);

  useEffect(() => {
    if (!launchingGame || config?.gameRunning) return;
    const pollTimer = setInterval(() => {
      api.getConfig().then(setConfig).catch(() => {});
    }, 1000);
    const safetyTimer = setTimeout(() => {
      launchingRef.current = false;
      setLaunchingGame(false);
    }, 30000);
    return () => {
      clearInterval(pollTimer);
      clearTimeout(safetyTimer);
    };
  }, [launchingGame, config?.gameRunning, setConfig]);

  const startBeamNG = useCallback(
    async (mode?: LaunchMode) => {
      if (launchingRef.current || config?.gameRunning) return;
      const target = mode ?? launchMode;
      if (mode) selectLaunchMode(mode);
      launchingRef.current = true;
      setLaunchingGame(true);
      try {
        await api.startBeamNG(target);
      } catch (err) {
        launchingRef.current = false;
        setLaunchingGame(false);
        showToast(`Failed to launch BeamNG: ${String(err)}`, 'error');
      }
    },
    [config?.gameRunning, launchMode, selectLaunchMode, showToast]
  );

  return { launchMode, launchingGame, selectLaunchMode, startBeamNG };
}
