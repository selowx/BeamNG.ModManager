import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, FileUp, X } from 'lucide-react';
import type { ProfileImportAnalysis, ProfileModRef } from '../../types';
import { cn } from '../../utils';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export interface ImportProfileModalProps {
  open: boolean;
  existingProfileNames: string[];
  busy: boolean;
  onClose: () => void;
  onAnalyze: (rawJson: string) => Promise<ProfileImportAnalysis | null>;
  onCommit: (input: {
    name: string;
    description: string;
    tag: string;
    pinPolicy: 'keep_pinned' | 'strict';
    modIds: string[];
    modRefs: Record<string, ProfileModRef>;
  }) => Promise<unknown>;
  onDownloadMissing: (refs: ProfileModRef[]) => Promise<unknown>;
}

export function ImportProfileModal({
  open,
  existingProfileNames,
  busy,
  onClose,
  onAnalyze,
  onCommit,
  onDownloadMissing,
}: ImportProfileModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rawJson, setRawJson] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ProfileImportAnalysis | null>(null);
  const [targetName, setTargetName] = useState('');

  useEffect(() => {
    if (!open) { setRawJson(''); setAnalysis(null); setTargetName(''); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const nameConflict = useMemo(() => {
    const trimmed = targetName.trim().toLowerCase();
    if (!trimmed) return false;
    if (existingProfileNames.some((n) => n.trim().toLowerCase() === trimmed)) return true;
    return Boolean(analysis?.duplicateNameExists && trimmed === analysis.name.trim().toLowerCase());
  }, [analysis, existingProfileNames, targetName]);

  if (!open) return null;

  const runAnalyze = async (text: string) => {
    if (!text.trim()) return;
    setAnalyzing(true);
    const res = await onAnalyze(text);
    setAnalyzing(false);
    if (res) { setAnalysis(res); setTargetName(res.name); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    setRawJson(text);
    await runAnalyze(text);
  };

  const handleCommit = async (downloadMissing: boolean) => {
    if (!analysis || !targetName.trim() || busy) return;
    const created = await onCommit({
      name: targetName.trim(),
      description: analysis.description,
      tag: analysis.tag || 'general',
      pinPolicy: analysis.pinPolicy === 'strict' ? 'strict' : 'keep_pinned',
      modIds: analysis.modIds,
      modRefs: analysis.modRefs,
    });
    if (!created) return;
    if (downloadMissing && analysis.missingDownloadable.length > 0) await onDownloadMissing(analysis.missingDownloadable);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-[#1c202a] border border-[#323949] rounded-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-[#161922] border-b border-[#323949] flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">Import Profile Pack</h3>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></Button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-300 font-semibold">Paste Profile JSON or Load File</span>
            <div>
              <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={(e) => void handleFileChange(e)} className="hidden" />
              <Button type="button" variant="secondary" size="xs" onClick={() => fileInputRef.current?.click()}>
                <FileUp className="w-3 h-3" />
                Load .json
              </Button>
            </div>
          </div>

          <textarea
            value={rawJson}
            onChange={(e) => { setRawJson(e.target.value); setAnalysis(null); }}
            rows={5}
            placeholder='{"name":"Touge Pack","modIds":[...]}'
            className="w-full rounded-sm border border-[#323949] bg-[#161922] p-2.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[#ff6600]"
          />

          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" disabled={!rawJson.trim() || analyzing} onClick={() => void runAnalyze(rawJson)}>
              {analyzing ? 'Analyzing...' : 'Analyze JSON'}
            </Button>
          </div>

          {analysis && (
            <div className="space-y-2.5 pt-2 border-t border-[#323949]">
              <div className="grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
                <div className="p-2 rounded-sm bg-emerald-950/40 border border-emerald-800/50 text-emerald-300">
                  <div className="text-sm font-bold">{analysis.installedCount}</div>
                  <div className="text-[11px] uppercase">Installed</div>
                </div>
                <div className="p-2 rounded-sm bg-amber-950/40 border border-amber-800/50 text-amber-300">
                  <div className="text-sm font-bold">{analysis.missingDownloadable.length}</div>
                  <div className="text-[11px] uppercase">Missing in Repo</div>
                </div>
                <div className="p-2 rounded-sm bg-[#222733] border border-[#323949] text-zinc-300">
                  <div className="text-sm font-bold">{analysis.missingManual.length}</div>
                  <div className="text-[11px] uppercase">Manual External</div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-zinc-300 font-semibold">Target Pack Name</label>
                <Input value={targetName} onChange={(e) => setTargetName(e.target.value)} className={cn(nameConflict && 'border-amber-500 focus:border-amber-400')} />
                {nameConflict && (
                  <div className="flex items-center gap-1 text-[11px] text-amber-300">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>A profile with this name already exists. Rename or import anyway.</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 bg-[#161922] border-t border-[#323949] flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="secondary" size="sm" disabled={!analysis || !targetName.trim() || busy} onClick={() => void handleCommit(false)}>Import Only</Button>
          {analysis && analysis.missingDownloadable.length > 0 && (
            <Button type="button" size="sm" disabled={!targetName.trim() || busy} onClick={() => void handleCommit(true)}>
              <Download className="w-3 h-3" />
              Import &amp; Download Missing ({analysis.missingDownloadable.length})
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
