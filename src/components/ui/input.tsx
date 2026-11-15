import React from 'react';
import { cn } from '../../utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'flex h-8 w-full rounded-sm border border-[#323949] bg-[#161922] px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-400 outline-none transition-colors focus:border-[#ff6600] focus-visible:ring-1 focus-visible:ring-[#ff6600]/40 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
