import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils';

export interface LoadingImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  containerClassName?: string;
  fallback?: React.ReactNode;
  hideOnError?: boolean;
  spinnerClassName?: string;
}

export function LoadingImage({
  src,
  alt = '',
  className,
  containerClassName,
  fallback = null,
  hideOnError = false,
  spinnerClassName,
  referrerPolicy = 'no-referrer',
  onLoad,
  onError,
  onClick,
  ...rest
}: LoadingImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    if (!src) {
      setLoaded(false);
      setFailed(true);
      return;
    }
    setFailed(false);
    const img = imgRef.current;
    if (img && img.complete) {
      if (img.naturalWidth > 0) {
        setLoaded(true);
      } else {
        setLoaded(false);
        setFailed(true);
      }
    } else {
      setLoaded(false);
    }
  }, [src]);

  if (failed || !src) {
    if (hideOnError) return null;
    return <>{fallback}</>;
  }

  return (
    <div
      onClick={onClick}
      className={cn('relative overflow-hidden bg-[#161922]', containerClassName)}
    >
      {!loaded && (
        <div className="absolute inset-0 bg-[#161922] flex items-center justify-center">
          <div className="absolute inset-0 bg-[#282e3c]/60 animate-pulse" />
          <Loader2 className={cn('relative w-4 h-4 animate-spin text-[#ff6600]', spinnerClassName)} />
        </div>
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        referrerPolicy={referrerPolicy}
        onLoad={(e) => {
          setLoaded(true);
          setFailed(false);
          onLoad?.(e);
        }}
        onError={(e) => {
          setFailed(true);
          setLoaded(false);
          onError?.(e);
        }}
        className={cn(
          'transition-opacity duration-200',
          loaded ? 'opacity-100' : 'opacity-0',
          className
        )}
        {...rest}
      />
    </div>
  );
}
