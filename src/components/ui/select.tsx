import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../utils';

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
}

export interface SelectDropdownProps<T extends string | number = string> {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  placeholder?: string;
  size?: 'xs' | 'sm';
  align?: 'left' | 'right';
  direction?: 'up' | 'down';
  className?: string;
  triggerClassName?: string;
  title?: string;
}

const SIZE_CLASSES: Record<'xs' | 'sm', string> = {
  xs: 'h-8 px-2.5 text-xs',
  sm: 'h-8 px-2.5 text-xs',
};

export function SelectDropdown<T extends string | number = string>({
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
  size = 'sm',
  align = 'left',
  direction = 'down',
  className,
  triggerClassName,
  title,
}: SelectDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selected = options.find((opt) => opt.value === value);

  return (
    <div ref={rootRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={cn(
          'bg-[#161922] hover:bg-[#282e3c] text-zinc-200 border border-[#323949] focus-visible:border-[#ff6600] focus-visible:ring-1 focus-visible:ring-[#ff6600]/40 rounded-sm font-mono tabular-nums inline-flex items-center justify-between gap-1.5 transition-colors cursor-pointer outline-none disabled:opacity-40 disabled:pointer-events-none',
          SIZE_CLASSES[size],
          triggerClassName
        )}
      >
        <span className="truncate">{selected ? selected.label : (placeholder ?? '')}</span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-150',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && !disabled && (
        <div
          role="listbox"
          className={cn(
            'absolute bg-[#1c202a] border border-[#323949] rounded-sm shadow-xl shadow-black/60 z-50 py-1 min-w-full max-h-56 overflow-y-auto',
            direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  'w-full px-2.5 py-1.5 text-xs text-left flex items-center justify-between gap-2 transition-colors cursor-pointer',
                  isSelected
                    ? 'bg-[#ff6600]/15 text-[#ff6600] font-semibold'
                    : 'text-zinc-300 hover:bg-[#282e3c] hover:text-white'
                )}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-[#ff6600] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
