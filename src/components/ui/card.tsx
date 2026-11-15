import React from 'react';
import { cn } from '../../utils';

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-sm bg-[#222733] border border-[#323949] text-zinc-100',
        className
      )}
      {...props}
    />
  );
}
