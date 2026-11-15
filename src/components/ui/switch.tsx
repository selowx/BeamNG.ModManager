import React from 'react';
import { cn } from '../../utils';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  className,
  title,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      disabled={disabled}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onCheckedChange(!checked);
      }}
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#ff6600] disabled:cursor-not-allowed disabled:opacity-40',
        'data-[state=checked]:bg-[#ff6600] data-[state=unchecked]:bg-[#222733] border-[#3a4254] data-[state=checked]:border-[#ff6600] data-[state=unchecked]:hover:border-zinc-500',
        className
      )}
    >
      <span
        data-state={checked ? 'checked' : 'unchecked'}
        className={cn(
          'pointer-events-none block h-3.5 w-3.5 rounded-full bg-white transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
        )}
      />
    </button>
  );
}
