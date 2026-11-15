import React from 'react';
import { cn } from '../../utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'amber';
  size?: 'default' | 'sm' | 'xs' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
      default:
        'bg-[#ff6600] text-white hover:bg-[#e65c00] border border-[#ff6600] font-semibold',
      secondary:
        'bg-[#282e3c] text-zinc-100 hover:bg-[#303748] border border-[#3a4254] font-medium',
      outline:
        'bg-[#1c202a] text-zinc-300 hover:bg-[#282e3c] hover:text-white border border-[#323949] font-medium',
      ghost:
        'bg-transparent text-zinc-400 hover:bg-[#282e3c] hover:text-zinc-100 border border-transparent font-medium',
      destructive:
        'bg-red-950/50 text-red-300 hover:bg-red-900/60 hover:text-red-100 border border-red-800/60 font-semibold',
      amber:
        'bg-amber-500 text-black hover:bg-amber-400 border border-amber-400 font-bold',
    };

    const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
      default: 'h-8 px-3.5 py-1.5 text-xs rounded-sm',
      sm: 'h-7 px-2.5 py-1 text-xs rounded-sm',
      xs: 'h-6 px-2 py-0.5 text-[11px] rounded-sm',
      icon: 'h-7 w-7 p-0 flex items-center justify-center rounded-sm',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#ff6600] disabled:pointer-events-none disabled:opacity-40 cursor-pointer',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
