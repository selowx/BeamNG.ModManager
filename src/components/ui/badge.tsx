import React from 'react';
import { cn } from '../../utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants: Record<NonNullable<BadgeProps['variant']>, string> = {
    default: 'bg-[#ff6600]/15 text-[#ff6600] border-[#ff6600]/40',
    secondary: 'bg-[#282e3c] text-zinc-300 border-[#3a4254]',
    outline: 'bg-[#1c202a] text-zinc-400 border-[#323949]',
    success: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40',
    warning: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
    destructive: 'bg-red-950/60 text-red-300 border-red-500/40',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-semibold border rounded-sm transition-colors',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
