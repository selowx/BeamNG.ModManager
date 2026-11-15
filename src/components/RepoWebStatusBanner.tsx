import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Clock, Link2, RefreshCw, WifiOff } from 'lucide-react';
import type { BridgeStatus, LaunchMode, RepoWebStatus } from '../types';
import { UI_TEXT } from '../i18n';
import { Button } from './ui/button';

export interface RepoWebStatusBannerProps {
  repoError: string | null;
  webStatus: RepoWebStatus | null;
  compact?: boolean;
  repoLoading: boolean;
  bridgeConnected: boolean;
  bridgeStatus: BridgeStatus | null;
  bridgeBusy: boolean;
  gameRunning: boolean;
  launchMode: LaunchMode;
  onRetry: () => void;
  onSwitchToBridge: () => void;
  onInstallBridge: () => void;
  onToggleBridgeEnabled: () => Promise<BridgeStatus | null> | void;
  onLaunchBeamNG: () => void;
  onProbeBridge: () => Promise<BridgeStatus | null>;
}

function isBridgeReady(s: BridgeStatus | null | undefined): boolean {
  return Boolean(s?.installed && s.enabled && s.reachable && s.onlineFeatures && s.authenticated);
}

export function RepoWebStatusBanner({
  repoError,
  webStatus,
  compact = false,
  repoLoading,
  bridgeConnected,
  bridgeStatus,
  bridgeBusy,
  gameRunning,
  launchMode,
  onRetry,
  onSwitchToBridge,
  onInstallBridge,
  onToggleBridgeEnabled,
  onLaunchBeamNG,
  onProbeBridge,
}: RepoWebStatusBannerProps) {
  const t = UI_TEXT;
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [waitingResponse, setWaitingResponse] = useState(false);
  const [probing, setProbing] = useState(false);

  const kind = webStatus?.kind || '';
  const isRateLimited =
    kind === 'rate_limit' ||
    kind === 'crowdsec' ||
    Boolean(webStatus?.rateLimited);
  const cooldown = webStatus?.cooldownRemainingSecs ?? 0;
  const errorDetail = webStatus?.message || repoError || 'Unable to reach beamng.com repository.';
  const installed = Boolean(bridgeStatus?.installed);
  const enabled = Boolean(bridgeStatus?.enabled);
  const reachable = Boolean(bridgeStatus?.reachable);
  const needsCtrlL = installed && enabled && gameRunning && !reachable;
  const needsOnline = installed && enabled && gameRunning && reachable && (!bridgeStatus?.onlineFeatures || !bridgeStatus?.authenticated);
  const retryLabel = isRateLimited && cooldown > 0 ? `Retry Now (${cooldown}s)` : 'Retry Now';
  const modeLabel = launchMode === 'steam' ? t.launchModeSteam : t.launchModeDirect;

  const handleSwitchClick = async () => {
    if (bridgeConnected) {
      onSwitchToBridge();
      return;
    }
    if (installed && !enabled) {
      setProbing(true);
      try {
        const next = (await Promise.resolve(onToggleBridgeEnabled())) ?? null;
        if (isBridgeReady(next)) {
          onSwitchToBridge();
          return;
        }
        if (next?.gameRunning && !next.reachable) {
          setWaitingResponse(true);
          const probed = await onProbeBridge();
          if (isBridgeReady(probed)) onSwitchToBridge();
          return;
        }
        const probed = await onProbeBridge();
        if (isBridgeReady(probed)) {
          onSwitchToBridge();
        } else if (probed?.gameRunning && !probed.reachable) {
          setWaitingResponse(true);
        } else {
          setChecklistOpen(true);
        }
      } finally {
        setProbing(false);
      }
      return;
    }
    if (needsCtrlL) {
      setProbing(true);
      setWaitingResponse(true);
      try {
        const next = await onProbeBridge();
        if (isBridgeReady(next)) {
          onSwitchToBridge();
        }
      } finally {
        setProbing(false);
      }
      return;
    }
    setChecklistOpen(true);
    if (needsOnline) {
      setProbing(true);
      try {
        const next = await onProbeBridge();
        if (isBridgeReady(next)) {
          onSwitchToBridge();
        }
      } finally {
        setProbing(false);
      }
    }
  };

  const renderChecklist = () => (
    <div className="rounded-sm bg-[#161922] border border-[#323949] p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-zinc-200">
          {installed ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <Circle className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          )}
          <span>{installed ? 'Game Bridge extension installed' : 'Game Bridge extension not installed'}</span>
        </div>
        {!installed && (
          <Button type="button" size="xs" variant="default" disabled={bridgeBusy} onClick={onInstallBridge}>
            {t.installGameBridgeBtn}
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-zinc-200">
          {gameRunning ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <Circle className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          )}
          <span>{gameRunning ? 'BeamNG.drive is running' : 'BeamNG.drive is not running'}</span>
        </div>
        {!gameRunning && (
          <Button type="button" size="xs" variant="default" onClick={onLaunchBeamNG}>
            <span>{t.launchBeamngBtn}</span>
            <span className="font-mono text-[11px] opacity-85">({modeLabel})</span>
          </Button>
        )}
      </div>

      {needsCtrlL && (
        <p className="text-[11px] text-amber-300 leading-relaxed">
          Waiting for BeamNG to respond — press Ctrl+L inside BeamNG (checking every 2s).
        </p>
      )}
      {needsOnline && (
        <p className="text-[11px] text-amber-300 leading-relaxed">
          Enable Online Features &amp; sign in inside BeamNG Main Menu to complete connection.
        </p>
      )}
      <p className="text-[11px] text-zinc-400">
        Background polling switches Repo automatically once connected.
      </p>
    </div>
  );

  const renderActions = () => (
    <div className="flex items-center gap-2 shrink-0">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={repoLoading || (isRateLimited && cooldown > 0)}
        onClick={onRetry}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${repoLoading ? 'animate-spin' : ''}`} />
        <span>{retryLabel}</span>
      </Button>
      {!bridgeConnected && (
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={bridgeBusy || probing}
          onClick={() => void handleSwitchClick()}
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>{t.switchToBridgeBtn}</span>
        </Button>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="mb-4 rounded-sm bg-[#1c202a] border border-amber-500/40 px-3.5 py-2.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-100">
                {isRateLimited ? 'Web Repository Rate Limited (HTTP 429 / CrowdSec)' : 'Failed to Load Web Repository'}
              </p>
              <p className="text-[11px] text-zinc-300 truncate">
                {isRateLimited
                  ? `Cooldown: ${cooldown}s · Switch to Game Bridge to browse without web rate limits.`
                  : errorDetail}
              </p>
            </div>
          </div>
          {renderActions()}
        </div>

        {waitingResponse && !checklistOpen && needsCtrlL && (
          <p className="text-[11px] text-amber-300 leading-relaxed">
            Waiting for BeamNG to respond — press Ctrl+L inside BeamNG (checking every 2s).
          </p>
        )}
        {checklistOpen && !bridgeConnected && renderChecklist()}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-10 rounded-sm bg-[#1c202a] border border-[#323949] p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-sm bg-[#222733] border border-[#323949] flex items-center justify-center shrink-0">
          {isRateLimited ? (
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          ) : (
            <WifiOff className="w-4 h-4 text-red-400" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold text-zinc-100">
            {isRateLimited ? 'Web Repository Rate Limited (HTTP 429 / CrowdSec)' : 'Failed to Load Web Repository'}
          </h3>
          {isRateLimited ? (
            <>
              <p className="text-xs text-zinc-300 font-mono tabular-nums">
                {cooldown > 0 ? `Cooldown: ${cooldown}s` : 'Cooldown elapsed — ready to retry.'}
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Switch to Game Bridge to browse and download without web rate limits.
              </p>
            </>
          ) : (
            <p className="text-xs text-zinc-300 break-words leading-relaxed">{errorDetail}</p>
          )}
        </div>
      </div>

      {waitingResponse && !checklistOpen && needsCtrlL && (
        <p className="text-xs text-amber-300 leading-relaxed bg-[#161922] border border-[#323949] rounded-sm px-3 py-2">
          Waiting for BeamNG to respond — press Ctrl+L inside BeamNG (checking every 2s).
        </p>
      )}

      {checklistOpen && !bridgeConnected && renderChecklist()}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#323949]">
        {renderActions()}
      </div>
    </div>
  );
}
