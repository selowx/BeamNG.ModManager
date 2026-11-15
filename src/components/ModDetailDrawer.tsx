import {
  BookmarkCheck, BookmarkMinus, BookmarkPlus, Download, ExternalLink,
  HardDrive, Lock, Power, Search, Trash2, X,
} from 'lucide-react';
import type { LocalMod, RepoModDetails, RepoModItem } from '../types';
import { UI_TEXT } from '../i18n';
import { formatBytes } from '../utils';
import { useModDrawerMedia } from '../hooks/useModDrawerMedia';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { LoadingImage } from './ui/LoadingImage';
import { ModPatchNotes } from './ModPatchNotes';
import { ImageLightboxModal } from './ImageLightboxModal';

export interface ModDetailDrawerProps {
  selectedMod: RepoModItem | null;
  selectedLocalMod?: LocalMod | null;
  modDetails: RepoModDetails | null;
  detailsLoading: boolean;
  bridgeConnected: boolean;
  subBusy?: boolean;
  downloadStatus?: string;
  onClose: () => void;
  onInstallMod: (resourceId: number, slug: string, title: string) => void;
  onOpenExternalUrl: (url: string) => void;
  onSearchInRepo: (query: string) => void;
  onSubscribeMod: (tagId: string, resourceId?: number) => void;
  onUnsubscribeMod: (tagId: string, deleteLocal: boolean, localModId: string | null, resourceId?: number) => void;
  onToggleLocalMod?: (mod: LocalMod) => void;
  onDeleteLocalMod?: (mod: LocalMod) => void;
}

const normVer = (v?: string | null) => (v || '').trim().replace(/^v/i, '');

export function ModDetailDrawer({
  selectedMod, selectedLocalMod, modDetails, detailsLoading, bridgeConnected, subBusy = false, downloadStatus,
  onClose, onInstallMod, onOpenExternalUrl, onSearchInRepo, onSubscribeMod, onUnsubscribeMod,
  onToggleLocalMod, onDeleteLocalMod,
}: ModDetailDrawerProps) {
  const {
    ugcRef, effectiveResourceId, effectiveSlug, sanitizedDescriptionHtml, displayedUpdates,
    updatesLoading, updatesError, fetchChangelog, lightbox, openLightbox,
    setLightboxIndex, closeLightbox, handleUgcClick,
  } = useModDrawerMedia({ selectedMod, modDetails, detailsLoading, onOpenExternalUrl });

  if (!selectedMod) return null;

  const t = UI_TEXT;
  const hasResourceId = effectiveResourceId > 0;
  const tagId = selectedMod.tagId || modDetails?.tagId || selectedLocalMod?.tagId || null;
  const isSubscribed = Boolean(modDetails?.subscribed ?? selectedMod.subscribed ?? selectedLocalMod?.subscribed);
  const effectiveStatus = modDetails?.installStatus || selectedMod.installStatus;
  const isQueueActive = Boolean(
    downloadStatus && ['downloading', 'resolving', 'verifying', 'queued', 'paused'].includes(downloadStatus),
  );
  const targetSlug = effectiveSlug || `resources/${selectedMod.resourceId}/`;
  const externalUrl = targetSlug.startsWith('http') ? targetSlug : `https://www.beamng.com/${targetSlug.replace(/^\/+/, '')}`;
  const iconFallback = (
    <div className="w-14 h-14 rounded-sm border border-[#323949] shrink-0 bg-[#161922] flex items-center justify-center text-zinc-400">
      <HardDrive className="w-6 h-6" />
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/70 flex justify-end" onClick={onClose}>
        <div className="w-[clamp(500px,46vw,940px)] max-w-[94vw] bg-[#222733] border-l border-[#323949] h-full flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="p-5 border-b border-[#323949] flex items-start justify-between gap-4 bg-[#1c202a]">
            <div className="flex gap-3.5">
              <LoadingImage
                src={selectedMod.iconUrl}
                alt={selectedMod.title}
                containerClassName="w-14 h-14 rounded-sm border border-[#323949] shrink-0"
                className="w-full h-full object-cover"
                fallback={iconFallback}
              />
              <div>
                <h2 className="flex items-center gap-2 text-base italic font-bold tracking-wide text-white leading-snug">
                  <span className="inline-block w-2 h-4 bg-[#ff6600] -skew-x-[18deg] shrink-0" />
                  <span>{selectedMod.title}</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {t.authorLabel} <strong className="text-zinc-200">{selectedMod.author || '—'}</strong> • {t.versionLabel}{' '}
                  {selectedLocalMod && modDetails?.version && normVer(modDetails.version) !== normVer(selectedLocalMod.version) ? (
                    <span className="font-mono tabular-nums text-amber-400 font-semibold">v{selectedLocalMod.version} → v{modDetails.version}</span>
                  ) : (
                    <span className="font-mono tabular-nums text-[#ff6600]">v{selectedMod.version || '1.0'}</span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {isSubscribed && <Badge variant="default" className="text-[11px]"><BookmarkCheck className="w-3 h-3" /><span>{t.subscribedBadge}</span></Badge>}
                  {modDetails?.fileSizeText && <Badge variant="outline" className="text-[11px] font-mono tabular-nums">{t.sizeLabel} {modDetails.fileSizeText}</Badge>}
                </div>
              </div>
            </div>
            <Button variant="outline" size="icon" onClick={onClose} title={t.closeTitle}><X className="w-4 h-4" /></Button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {(selectedLocalMod || (!detailsLoading && modDetails?.tagline)) && (
              <section className="space-y-2.5">
                <h3 className="text-xs uppercase tracking-wider italic font-bold text-[#ff6600] border-b border-[#323949] pb-1.5">Mod Information</h3>
                {!detailsLoading && modDetails?.tagline && <p className="text-sm text-zinc-200 leading-relaxed">{modDetails.tagline}</p>}
                {selectedLocalMod && (
                  <div className="bg-[#1c202a] border border-[#323949] rounded-sm p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div><span className="text-zinc-400">{t.fileNameLabel} </span><span className="font-mono text-zinc-200 break-all">{selectedLocalMod.filename}</span></div>
                    <div><span className="text-zinc-400">{t.sizeLabel} </span><span className="font-mono tabular-nums text-zinc-200">{formatBytes(selectedLocalMod.sizeBytes)}</span></div>
                    <div className="sm:col-span-2">
                      <span className="text-zinc-400">{t.locationLabel} </span>
                      <span className="font-mono text-zinc-200">
                        {selectedLocalMod.location === 'disabled' ? 'mods_disabled/' : selectedLocalMod.location === 'unpacked' ? 'mods/unpacked/' : selectedLocalMod.originDir === 'repo' || selectedLocalMod.location === 'repo' ? 'mods/repo/' : 'mods/'}
                      </span>
                    </div>
                  </div>
                )}
              </section>
            )}

            {(tagId || selectedLocalMod) && (
              <section className="bg-[#1c202a] border border-[#323949] rounded-sm p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs uppercase tracking-wider font-bold text-zinc-200">Subscription &amp; Local Controls</h3>
                  {tagId && <span className="text-[11px] font-mono text-zinc-400">Tag: {tagId}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {tagId && (isSubscribed ? (
                    <Button type="button" size="sm" variant="outline" disabled={!bridgeConnected || subBusy} onClick={() => onUnsubscribeMod(tagId, false, selectedLocalMod?.id ?? null, effectiveResourceId)}>
                      <BookmarkMinus className="w-3.5 h-3.5" /><span>{t.unsubscribeBtn}</span>
                    </Button>
                  ) : (
                    <Button type="button" size="sm" variant="default" disabled={!bridgeConnected || subBusy} onClick={() => onSubscribeMod(tagId, effectiveResourceId)}>
                      <BookmarkPlus className="w-3.5 h-3.5" /><span>{t.subscribeBtn}</span>
                    </Button>
                  ))}
                  {selectedLocalMod && (selectedLocalMod.pinned ? (
                    <Badge variant="secondary" className="text-[11px] py-1 px-2"><Lock className="w-3 h-3 text-[#ff6600]" /><span>Protected (Pinned) — Disable &amp; Delete Locked</span></Badge>
                  ) : (
                    <>
                      {onToggleLocalMod && (
                        <Button type="button" size="sm" variant="outline" disabled={subBusy} onClick={() => onToggleLocalMod(selectedLocalMod)}>
                          <Power className="w-3.5 h-3.5" /><span>{selectedLocalMod.active ? t.disableModBtn : t.enableModBtn}</span>
                        </Button>
                      )}
                      {onDeleteLocalMod && (
                        <Button type="button" size="sm" variant="destructive" disabled={subBusy} onClick={() => onDeleteLocalMod(selectedLocalMod)}>
                          <Trash2 className="w-3.5 h-3.5" /><span>{t.deleteZipBtn}</span>
                        </Button>
                      )}
                      {tagId && isSubscribed && (
                        <Button type="button" size="sm" variant="destructive" disabled={!bridgeConnected || subBusy} onClick={() => onUnsubscribeMod(tagId, true, selectedLocalMod.id, effectiveResourceId)}>
                          <Trash2 className="w-3.5 h-3.5" /><span>{t.unsubscribeDeleteBtn}</span>
                        </Button>
                      )}
                    </>
                  ))}
                </div>
                {tagId && !bridgeConnected && <p className="text-[11px] text-zinc-400">{t.connectBridgeSubHint}</p>}
              </section>
            )}

            {detailsLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-[#282e3c] rounded-sm w-3/4" />
                <div className="h-4 bg-[#282e3c] rounded-sm w-full" />
                <div className="h-4 bg-[#282e3c] rounded-sm w-5/6" />
                <div className="h-36 bg-[#282e3c] rounded-sm w-full mt-4" />
              </div>
            ) : (
              <>
                <ModPatchNotes
                  updates={displayedUpdates} loading={updatesLoading} canRetry={hasResourceId && updatesError}
                  onRetry={() => void fetchChangelog(effectiveSlug, effectiveResourceId)}
                  onOpenExternalUrl={onOpenExternalUrl} onImageClick={openLightbox}
                />
                {modDetails?.galleryImages && modDetails.galleryImages.length > 0 && (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {modDetails.galleryImages.slice(0, 6).map((img, i) => (
                      <LoadingImage
                        key={img || i}
                        src={img}
                        alt="Mod gallery preview"
                        hideOnError
                        loading="lazy"
                        onClick={() => openLightbox(img)}
                        containerClassName="rounded-sm h-28 w-full border border-[#323949] hover:border-[#ff6600] transition-colors cursor-zoom-in"
                        className="w-full h-full object-cover"
                      />
                    ))}
                  </div>
                )}
                <section className="space-y-2.5">
                  <h3 className="text-xs uppercase tracking-wider italic font-bold text-[#ff6600] border-b border-[#323949] pb-1.5">Overview &amp; Specifications</h3>
                  {sanitizedDescriptionHtml ? (
                    <div ref={ugcRef} onClick={handleUgcClick} className="ugc-content text-sm text-zinc-300 leading-relaxed bg-[#161922] p-3.5 rounded-sm border border-[#323949]" dangerouslySetInnerHTML={{ __html: sanitizedDescriptionHtml }} />
                  ) : (
                    <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line bg-[#161922] p-3.5 rounded-sm border border-[#323949]">{modDetails?.descriptionText || t.noDescription}</div>
                  )}
                </section>
              </>
            )}
          </div>

          <div className="p-4 bg-[#1c202a] border-t border-[#323949] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {hasResourceId ? (
                <Button variant="secondary" size="sm" onClick={() => onOpenExternalUrl(externalUrl)}>
                  <ExternalLink className="w-3.5 h-3.5 text-[#ff6600]" /><span>{t.openInBrowserBtn}</span>
                </Button>
              ) : tagId ? (
                <span className="text-xs font-mono tabular-nums text-zinc-400">Repo ID: {tagId}</span>
              ) : null}
            </div>
            {!hasResourceId || selectedMod.resourceId === 0 ? (
              <Button variant="default" size="sm" onClick={() => { onSearchInRepo(selectedMod.title); onClose(); }}>
                <Search className="w-4 h-4" /><span>{t.searchInRepoBtn}</span>
              </Button>
            ) : (
              <Button
                variant={effectiveStatus === 'update_available' ? 'amber' : 'default'}
                size="sm"
                disabled={isQueueActive}
                onClick={() => onInstallMod(selectedMod.resourceId, effectiveSlug, selectedMod.title)}
              >
                <Download className="w-4 h-4" />
                <span>
                  {downloadStatus === 'paused'
                    ? 'Paused in Queue'
                    : downloadStatus === 'queued'
                      ? 'Queued for Download'
                      : downloadStatus === 'verifying'
                        ? 'Verifying Archive...'
                        : isQueueActive
                          ? 'Downloading...'
                          : effectiveStatus === 'update_available'
                            ? `Update Mod (v${modDetails?.version || selectedLocalMod?.latestVersion || selectedMod.version})`
                            : effectiveStatus === 'installed' ? t.reinstallBtn : t.directInstallBtn}
                </span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <ImageLightboxModal
        images={lightbox?.images ?? []}
        index={lightbox?.index ?? null}
        onIndexChange={setLightboxIndex}
        onClose={closeLightbox}
      />
    </>
  );
}
