import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Link2, RefreshCw } from 'lucide-react';
import { api } from '../api';
import type { BridgeStatus } from '../types';
import { UI_TEXT } from '../i18n';
import { Button } from './ui/button';

export interface BridgeControlPopoverProps {
  repoSource: string | null;
  bridgeStatus: BridgeStatus | null;
  bridgeBusy: boolean;
  onInstallBridge: () => void;
  onReinstallBridge: () => void;
  onUninstallBridge: () => void;
  onToggleBridgeEnabled: () => Promise<BridgeStatus | null> | void;
  onCheckBridge?: () => void;
}

function resolveBridgeState(status: BridgeStatus | null) {
  const t = UI_TEXT;
  if (!status || !status.installed) return { label: t.installBridgeBtn, status: t.bridgeStatusNotInstalled, dot: 'bg-zinc-500', ok: false };
  if (!status.enabled) return { label: t.bridgeStatusPaused, status: t.bridgeStatusPaused, dot: 'bg-amber-500', ok: false };
  if (!status.gameRunning) return { label: t.bridgeFallbackLabel, status: t.bridgeStatusWaitingGame, dot: 'bg-zinc-400', ok: false };
  if (!status.reachable || !status.extensionReady) return { label: t.bridgeFallbackLabel, status: t.bridgeStatusRestartMount, dot: 'bg-amber-500', ok: false };
  if (!status.onlineFeatures || !status.authenticated) return { label: t.bridgeFallbackLabel, status: t.bridgeStatusOnlineDisabled, dot: 'bg-amber-500', ok: false };
  return {
    label: t.bridgeActiveLabel,
    status: t.bridgeStatusConnected,
    dot: 'bg-emerald-400',
    ok: true,
  };
}

export function BridgeControlPopover({
  repoSource, bridgeStatus, bridgeBusy, onInstallBridge, onReinstallBridge, onUninstallBridge, onToggleBridgeEnabled, onCheckBridge,
}: BridgeControlPopoverProps) {
  const t = UI_TEXT;
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const installed = bridgeStatus?.installed ?? false;
  const enabled = bridgeStatus?.enabled ?? true;
  const port = bridgeStatus?.port ?? 23519;
  const isOutdated = Boolean(installed && bridgeStatus?.outdated);
  const installedVersion = bridgeStatus?.installedVersion;
  const bundledVersion = bridgeStatus?.bundledVersion;
  const runningVersion = bridgeStatus?.runningVersion;
  const state = resolveBridgeState(bridgeStatus);
  const usingGameBridge = repoSource === 'game_bridge';
  const needsCtrlL = Boolean(
    installed && enabled && bridgeStatus?.gameRunning && (!bridgeStatus?.reachable || !bridgeStatus?.extensionReady)
  );
  const runningVersionMismatch = Boolean(
    installed && !isOutdated && runningVersion && bundledVersion && runningVersion !== bundledVersion
  );
  const showAttention = isOutdated || runningVersionMismatch;
  const showWarningBox = Boolean(
    (needsCtrlL || runningVersionMismatch) &&
      !(!isOutdated && runningVersion && bundledVersion && runningVersion === bundledVersion)
  );

  const handleCheckNow = async () => {
    if (checking || bridgeBusy) return;
    if (!runningVersionMismatch && onCheckBridge) {
      onCheckBridge();
      return;
    }
    setChecking(true);
    try {
      const next = runningVersionMismatch
        ? await api.reloadBridgeExtension()
        : await api.getBridgeStatus();
      window.dispatchEvent(new CustomEvent<BridgeStatus>('modmanager:bridge-status', { detail: next }));
    } catch {
      // ignore transient connection failure while game initializes
    } finally {
      setChecking(false);
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button
        type="button" variant="outline" size="default" aria-expanded={open} aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={`h-8 px-2.5 gap-1.5 bg-[#161922] text-zinc-200 hover:border-[#ff6600] ${
          showAttention
            ? 'border-amber-500/70'
            : state.ok
            ? 'border-emerald-500/40'
            : 'border-[#323949]'
        }`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${state.dot}`} />
        <Link2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <span className="text-xs font-medium whitespace-nowrap">{state.label}</span>
        {isOutdated ? (
          <span className="px-1.5 py-0.5 rounded-sm bg-[#ff6600] text-white text-[11px] font-bold uppercase tracking-wide leading-none whitespace-nowrap">
            {t.bridgeUpdatePill}
          </span>
        ) : runningVersionMismatch ? (
          <span className="px-1.5 py-0.5 rounded-sm bg-amber-500 text-black text-[11px] font-bold uppercase tracking-wide leading-none whitespace-nowrap">
            {t.bridgeReloadPill}
          </span>
        ) : null}
        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
      </Button>

      {open && (
        <div role="dialog" aria-label="Game Bridge Status" className="absolute right-0 top-full mt-1.5 w-72 bg-[#1c202a] border border-[#323949] rounded-sm p-3 z-40 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border border-[#323949] bg-[#161922] text-[11px] font-medium text-zinc-200">
              <span className={`w-1.5 h-1.5 rounded-full ${usingGameBridge ? 'bg-emerald-400' : 'bg-zinc-400'}`} />
              {usingGameBridge ? t.bridgeApiBadge : t.webCatalogBadge}
            </span>
            <span className="text-[11px] font-mono tabular-nums text-zinc-400">localhost:{port}</span>
          </div>

          <div className="rounded-sm bg-[#161922] border border-[#323949] px-2.5 py-2 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-100">
              <span className={`w-2 h-2 rounded-full shrink-0 ${state.dot}`} />
              <span>{state.status}</span>
            </div>
            {installed && bridgeStatus && (
              <div className="text-[11px] font-mono tabular-nums text-zinc-400">
                {t.bridgeEndpointLabel} 127.0.0.1:{port} • {bridgeStatus.requestsServed} req
              </div>
            )}
            {!installed && bundledVersion && (
              <div className="text-[11px] font-mono tabular-nums text-zinc-400">
                Bundled v{bundledVersion}
              </div>
            )}
            {installed && bridgeStatus && (
              <div className="text-[11px] font-mono tabular-nums">
                {isOutdated && bundledVersion ? (
                  <span className="text-amber-300">
                    v{installedVersion || '?'} -&gt; v{bundledVersion} available
                  </span>
                ) : (
                  <span className="text-zinc-400">
                    v{installedVersion || 'unknown'}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="rounded-sm bg-[#222733] border border-[#323949] px-2.5 py-2 text-[11px] text-zinc-300 leading-relaxed">
            {installed ? (
              <>
                <span>Configure port &amp; pause inside BeamNG: </span>
                <strong className="text-zinc-100 font-semibold">Main Menu -&gt; More... -&gt; Mod Manager Bridge</strong>
              </>
            ) : (
              <span>{t.bridgePreInstallDesc}</span>
            )}
          </div>

          {showWarningBox && (
            <div className="rounded-sm bg-[#161922] border border-amber-500/40 px-2.5 py-2 space-y-2">
              <p className="text-[11px] text-amber-200 leading-relaxed">
                {runningVersionMismatch
                  ? `BeamNG is running v${runningVersion} while v${bundledVersion} is staged on disk. Reload inside BeamNG (Ctrl+L) or click below to retry.`
                  : 'Press Ctrl+L inside BeamNG to load immediately, or restart BeamNG.'}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                disabled={bridgeBusy || checking}
                onClick={() => void handleCheckNow()}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin text-[#ff6600]' : ''}`} />
                <span>{runningVersionMismatch ? t.bridgeReloadRecheckBtn : t.bridgeCheckConnectionBtn}</span>
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-0.5">
            {!installed ? (
              <Button type="button" size="sm" variant="default" className="w-full" disabled={bridgeBusy} onClick={onInstallBridge}>
                {t.installBridgeBtn}
              </Button>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant={enabled ? 'outline' : 'default'} className="flex-1" disabled={bridgeBusy} onClick={onToggleBridgeEnabled}>
                    {enabled ? t.pauseBridgeBtn : t.enableBridgeBtn}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={isOutdated ? 'default' : 'outline'}
                    className="flex-1"
                    disabled={bridgeBusy}
                    onClick={onReinstallBridge}
                    title={
                      isOutdated
                        ? `Update bridge extension${bundledVersion ? ` to v${bundledVersion}` : ''}`
                        : 'Force rewrite bridge mod files'
                    }
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{isOutdated ? t.updateBridgeBtn : t.reinstallBridgeBtn}</span>
                  </Button>
                </div>
                <Button type="button" size="sm" variant="destructive" className="w-full" disabled={bridgeBusy} onClick={onUninstallBridge}>
                  {t.uninstallBridgeBtn}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
