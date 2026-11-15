import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Loader2, X } from 'lucide-react';
import { Button } from './ui/button';

export interface ImageLightboxModalProps {
  images: string[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

export function ImageLightboxModal({ images, index, onIndexChange, onClose }: ImageLightboxModalProps) {
  const isOpen = index !== null && images.length > 0;
  const safeIndex = isOpen ? ((index % images.length) + images.length) % images.length : 0;
  const currentSrc = isOpen ? images[safeIndex] : '';
  const imgRef = useRef<HTMLImageElement>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentSrc) return;
    setFailed(false);
    const img = imgRef.current;
    if (img && img.complete) {
      if (img.naturalWidth > 0) {
        setLoading(false);
      } else {
        setLoading(false);
        setFailed(true);
      }
    } else {
      setLoading(true);
    }
  }, [isOpen, currentSrc]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft' && images.length > 1) {
        e.preventDefault();
        onIndexChange((safeIndex - 1 + images.length) % images.length);
      } else if (e.key === 'ArrowRight' && images.length > 1) {
        e.preventDefault();
        onIndexChange((safeIndex + 1) % images.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, images.length, safeIndex, onIndexChange, onClose]);

  if (!isOpen) return null;

  const hasMultiple = images.length > 1;
  const step = (delta: number) => onIndexChange((safeIndex + delta + images.length) % images.length);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="h-8 px-2.5 rounded-sm bg-[#1c202a] border border-[#323949] text-xs font-mono tabular-nums text-zinc-200 inline-flex items-center">
          {safeIndex + 1} / {images.length}
        </span>
        <Button
          type="button" variant="outline" size="icon"
          className="h-8 w-8 bg-[#1c202a] border-[#323949] text-zinc-200 hover:border-[#ff6600] hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title="Close (Esc)" aria-label="Close"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {hasMultiple && (
        <Button
          type="button" variant="outline" size="icon"
          className="absolute left-4 top-1/2 -translate-y-1/2 h-9 w-9 bg-[#1c202a] border-[#323949] text-zinc-200 hover:border-[#ff6600] hover:text-white"
          onClick={(e) => { e.stopPropagation(); step(-1); }}
          title="Previous image (Left Arrow)" aria-label="Previous image"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
      )}

      {loading && !failed && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="px-6 py-5 rounded-sm bg-[#161922] border border-[#323949] flex flex-col items-center gap-2.5 select-none"
        >
          <Loader2 className="w-6 h-6 animate-spin text-[#ff6600]" />
          <span className="text-xs text-zinc-300">Loading image...</span>
        </div>
      )}

      {failed && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="px-6 py-5 rounded-sm bg-[#161922] border border-[#323949] flex flex-col items-center gap-2 text-zinc-400 select-none"
        >
          <ImageOff className="w-6 h-6 text-zinc-500" />
          <span className="text-xs">Failed to load image.</span>
        </div>
      )}

      <img
        key={currentSrc}
        ref={imgRef}
        src={currentSrc}
        alt={`Preview ${safeIndex + 1} of ${images.length}`}
        referrerPolicy="no-referrer"
        onLoad={() => {
          setLoading(false);
          setFailed(false);
        }}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
        onClick={(e) => e.stopPropagation()}
        className={
          loading || failed
            ? 'hidden'
            : 'max-w-[90vw] max-h-[85vh] object-contain rounded-sm border border-[#323949] bg-[#161922] select-none'
        }
      />

      {hasMultiple && (
        <Button
          type="button" variant="outline" size="icon"
          className="absolute right-4 top-1/2 -translate-y-1/2 h-9 w-9 bg-[#1c202a] border-[#323949] text-zinc-200 hover:border-[#ff6600] hover:text-white"
          onClick={(e) => { e.stopPropagation(); step(1); }}
          title="Next image (Right Arrow)" aria-label="Next image"
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      )}
    </div>
  );
}
