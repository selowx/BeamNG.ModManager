import React from 'react';
import { AlertTriangle, CheckCircle2, Layers, RefreshCw, ShieldAlert } from 'lucide-react';
import type { ScanReport } from '../types';
import { UI_TEXT } from '../i18n';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';

export interface HealthScannerViewProps {
  embedded?: boolean;
  scanReport: ScanReport | null;
  scanning: boolean;
  onRunHealthScan: () => void;
  onDisableModByFilename?: (filename: string) => void;
}

export function HealthScannerView({
  embedded = false,
  scanReport,
  scanning,
  onRunHealthScan,
  onDisableModByFilename,
}: HealthScannerViewProps) {
  const t = UI_TEXT;

  const content = (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#161922]">
      {/* Locked Single-Row Top Action Bar */}
      <div className="h-12 px-5 bg-[#1c202a] border-b border-[#323949] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center min-w-0">
          {scanReport ? (
            <span className="text-xs font-mono tabular-nums text-zinc-300 truncate">
              <span className="text-emerald-400 font-semibold">
                {scanReport.totalModsScanned} {t.archivesUnit} · {scanReport.scanDurationMs} ms
              </span>
              <span className="text-zinc-500 mx-2">·</span>
              <span>
                {scanReport.conflicts.length} {t.conflictsFoundSuffix}
              </span>
            </span>
          ) : (
            <span className="text-xs text-zinc-400 truncate">{t.noScanYet}</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="default"
            size="default"
            onClick={onRunHealthScan}
            disabled={scanning}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? t.scanningBtn : scanReport ? t.rescanBtn : t.startScanBtn}</span>
          </Button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div
        className={
          scanReport
            ? 'flex-1 min-h-0 p-5 bg-[#161922] flex flex-col overflow-y-auto lg:overflow-hidden'
            : 'flex-1 overflow-y-auto p-5 bg-[#161922]'
        }
      >
      {scanReport ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:flex-1 lg:min-h-0">
          {/* Corrupt & Duplicate Summary */}
          <div className="space-y-4 lg:overflow-y-auto lg:min-h-0 pr-0.5">
            <Card
              className={
                scanReport.corruptZips.length > 0
                  ? 'p-4 bg-[#222733] border-red-500/50'
                  : 'p-4 bg-[#222733] border-[#323949]'
              }
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span>{t.corruptZipsTitle}</span>
                <Badge
                  variant={scanReport.corruptZips.length === 0 ? 'success' : 'destructive'}
                  className="font-mono tabular-nums"
                >
                  {scanReport.corruptZips.length}
                </Badge>
              </h3>
              {scanReport.corruptZips.length === 0 ? (
                <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  {t.allZipsHealthy}
                </p>
              ) : (
                <ul className="space-y-1.5 text-xs text-red-300 font-mono tabular-nums">
                  {scanReport.corruptZips.map((z, idx) => (
                    <li
                      key={idx}
                      className="p-2 rounded-sm bg-red-950/40 border border-red-800/50 break-all"
                    >
                      {z}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              className={
                scanReport.duplicateMods.length > 0
                  ? 'p-4 bg-[#222733] border-amber-500/50'
                  : 'p-4 bg-[#222733] border-[#323949]'
              }
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>{t.duplicateModsTitle}</span>
                <Badge
                  variant={scanReport.duplicateMods.length === 0 ? 'success' : 'warning'}
                  className="font-mono tabular-nums"
                >
                  {scanReport.duplicateMods.length}
                </Badge>
              </h3>
              {scanReport.duplicateMods.length === 0 ? (
                <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  {t.noDuplicatesFound}
                </p>
              ) : (
                <ul className="space-y-1.5 text-xs text-amber-200 font-mono tabular-nums">
                  {scanReport.duplicateMods.map((d, idx) => (
                    <li
                      key={idx}
                      className="p-2 rounded-sm bg-amber-950/40 border border-amber-800/50 break-all"
                    >
                      {d}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* File Conflicts List */}
          <Card className="lg:col-span-2 p-4 flex flex-col bg-[#222733] border-[#323949] lg:h-full min-h-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                <span>{t.fileConflictsTitle}</span>
                <Badge
                  variant={scanReport.conflicts.length === 0 ? 'success' : 'destructive'}
                  className="font-mono tabular-nums"
                >
                  {scanReport.conflicts.length}
                </Badge>
              </h3>
            </div>
            {scanReport.conflicts.length === 0 ? (
              <div className="py-12 text-center text-emerald-400 text-xs flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{t.noConflictsFound}</span>
              </div>
            ) : (
              <div className="space-y-2.5 flex-1 min-h-0 overflow-y-auto pr-1">
                {scanReport.conflicts.map((c, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-sm bg-[#1c202a] border border-[#323949] flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono tabular-nums text-xs text-zinc-200 break-all">
                        {c.filePath}
                      </span>
                      <Badge
                        variant={
                          c.severity === 'high'
                            ? 'destructive'
                            : c.severity === 'medium'
                            ? 'warning'
                            : 'outline'
                        }
                        className="uppercase shrink-0 font-mono"
                      >
                        {c.severity === 'high'
                          ? t.severityHigh
                          : c.severity === 'medium'
                          ? t.severityMedium
                          : t.severityLow}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {c.mods.map((m) => (
                        <div key={m} className="inline-flex items-center gap-1.5 bg-[#282e3c] border border-[#323949] rounded-sm pl-2 pr-1 py-0.5">
                          <span className="font-mono tabular-nums text-[11px] font-semibold text-[#ff6600]">{m}</span>
                          {onDisableModByFilename && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="xs"
                              className="h-5 px-1.5"
                              onClick={() => onDisableModByFilename(m)}
                              title={t.disableConflictModTitle}
                            >
                              {t.disableBtn}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : (
        <Card className="flex flex-col items-center justify-center py-20 bg-[#222733] border-[#323949] text-zinc-400">
          <div className="w-12 h-12 rounded-sm bg-[#1c202a] border border-[#323949] flex items-center justify-center shrink-0 text-zinc-400 mb-3">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <p className="text-xs font-medium text-zinc-300 mb-4">{t.noScanYet}</p>
          <Button
            variant="default"
            onClick={onRunHealthScan}
            disabled={scanning}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? t.scanningBtn : t.startScanBtn}</span>
          </Button>
        </Card>
      )}
      </div>
    </div>
  );

  if (embedded) return content;

  return <div className="flex-1 flex overflow-hidden bg-[#161922]">{content}</div>;
}
