import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { api } from '../api';
import type { ModUpdateEntry, RepoModDetails, RepoModItem } from '../types';

interface UseModDrawerMediaOptions {
  selectedMod: RepoModItem | null;
  modDetails: RepoModDetails | null;
  detailsLoading: boolean;
  onOpenExternalUrl: (url: string) => void;
}

export function useModDrawerMedia({
  selectedMod,
  modDetails,
  detailsLoading,
  onOpenExternalUrl,
}: UseModDrawerMediaOptions) {
  const ugcRef = useRef<HTMLDivElement>(null);
  const updatesGenRef = useRef(0);
  const [extraUpdates, setExtraUpdates] = useState<ModUpdateEntry[] | null>(null);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updatesError, setUpdatesError] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  const effectiveResourceId = modDetails?.resourceId || selectedMod?.resourceId || 0;
  const effectiveSlug = modDetails?.slug || selectedMod?.slug || '';
  const hasDetailUpdates = (modDetails?.recentUpdates?.length ?? 0) > 0;

  const sanitizedDescriptionHtml = useMemo(() => {
    if (!modDetails?.descriptionHtml) return '';
    return modDetails.descriptionHtml.replace(
      /<img\b(?![^>]*\breferrerpolicy=)/gi,
      '<img referrerpolicy="no-referrer" '
    );
  }, [modDetails?.descriptionHtml]);

  useEffect(() => {
    const root = ugcRef.current;
    if (!root || !sanitizedDescriptionHtml) return;
    const cleanups: Array<() => void> = [];
    root.querySelectorAll('img').forEach((img) => {
      img.referrerPolicy = 'no-referrer';
      img.classList.add('cursor-zoom-in');
      const onLoad = () => img.classList.remove('ugc-img-loading');
      const onError = () => {
        img.classList.remove('ugc-img-loading');
        img.style.display = 'none';
      };
      if (img.complete) {
        if (img.naturalWidth === 0) onError();
        else onLoad();
      } else {
        img.classList.add('ugc-img-loading');
        img.addEventListener('load', onLoad, { once: true });
        img.addEventListener('error', onError, { once: true });
        cleanups.push(() => {
          img.removeEventListener('load', onLoad);
          img.removeEventListener('error', onError);
        });
      }
    });
    return () => cleanups.forEach((fn) => fn());
  }, [sanitizedDescriptionHtml]);

  useEffect(() => {
    updatesGenRef.current += 1;
    setExtraUpdates(null);
    setUpdatesLoading(false);
    setUpdatesError(false);
    setLightbox(null);
  }, [selectedMod?.resourceId, selectedMod?.localModId]);

  const fetchChangelog = useCallback(async (slug: string, resourceId: number) => {
    const gen = ++updatesGenRef.current;
    setUpdatesLoading(true);
    setUpdatesError(false);
    try {
      const list = await api.getRepoModUpdates(slug, resourceId);
      if (updatesGenRef.current === gen) {
        setExtraUpdates(Array.isArray(list) ? list : []);
      }
    } catch {
      if (updatesGenRef.current === gen) {
        setUpdatesError(true);
      }
    } finally {
      if (updatesGenRef.current === gen) {
        setUpdatesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!selectedMod || effectiveResourceId <= 0 || detailsLoading || hasDetailUpdates) return;
    const timer = window.setTimeout(() => {
      void fetchChangelog(effectiveSlug, effectiveResourceId);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [selectedMod, effectiveResourceId, effectiveSlug, detailsLoading, hasDetailUpdates, fetchChangelog]);

  const openLightbox = useCallback(
    (targetSrc: string) => {
      const seen = new Set<string>();
      const collected: string[] = [];
      const addSrc = (src?: string | null) => {
        const clean = (src || '').trim();
        if (clean && !seen.has(clean)) {
          seen.add(clean);
          collected.push(clean);
        }
      };
      (modDetails?.galleryImages ?? []).forEach(addSrc);
      ugcRef.current?.querySelectorAll('img').forEach((img) => {
        if (img.style.display !== 'none') {
          addSrc(img.currentSrc || img.getAttribute('src'));
        }
      });
      addSrc(targetSrc);
      if (collected.length > 0) {
        setLightbox({
          images: collected,
          index: Math.max(0, collected.indexOf(targetSrc.trim())),
        });
      }
    },
    [modDetails?.galleryImages]
  );

  const handleUgcClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const img = (e.target as HTMLElement | null)?.closest('img');
      if (img) {
        e.preventDefault();
        const src = img.currentSrc || img.getAttribute('src') || '';
        if (src) openLightbox(src);
        return;
      }
      const href = (e.target as HTMLElement | null)?.closest('a')?.getAttribute('href');
      if (!href) return;
      e.preventDefault();
      if (/^https?:\/\//i.test(href)) onOpenExternalUrl(href);
      else if (href.startsWith('/')) onOpenExternalUrl(`https://www.beamng.com${href}`);
    },
    [onOpenExternalUrl, openLightbox]
  );

  const setLightboxIndex = useCallback(
    (idx: number) => setLightbox((prev) => (prev ? { ...prev, index: idx } : prev)),
    []
  );
  const closeLightbox = useCallback(() => setLightbox(null), []);

  return {
    ugcRef,
    effectiveResourceId,
    effectiveSlug,
    sanitizedDescriptionHtml,
    displayedUpdates: hasDetailUpdates ? (modDetails?.recentUpdates ?? []) : (extraUpdates ?? []),
    updatesLoading,
    updatesError,
    fetchChangelog,
    lightbox,
    openLightbox,
    setLightboxIndex,
    closeLightbox,
    handleUgcClick,
  };
}
