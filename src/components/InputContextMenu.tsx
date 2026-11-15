import { useEffect, useRef, useState } from 'react';
import { Clipboard, Copy, Scissors, TextSelect } from 'lucide-react';
import { api } from '../api';
import { cn } from '../utils';

type EditableEl = HTMLInputElement | HTMLTextAreaElement;

interface MenuState {
  x: number;
  y: number;
  target: EditableEl;
  hasSelection: boolean;
  hasValue: boolean;
  editable: boolean;
  isPassword: boolean;
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button', 'checkbox', 'color', 'date', 'datetime-local', 'file',
  'hidden', 'image', 'month', 'radio', 'range', 'reset', 'submit', 'time', 'week',
]);

function isEditableInput(el: EventTarget | null): el is EditableEl {
  if (el instanceof HTMLTextAreaElement) return !el.disabled;
  if (el instanceof HTMLInputElement) {
    return !el.disabled && !NON_TEXT_INPUT_TYPES.has((el.type || 'text').toLowerCase());
  }
  return false;
}

function getSelectionRange(el: EditableEl): { start: number; end: number; supported: boolean } {
  try {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (typeof start === 'number' && typeof end === 'number') {
      return { start, end, supported: true };
    }
  } catch {
    // Numeric and special inputs can disallow selectionStart/End access.
  }
  return { start: 0, end: el.value.length, supported: false };
}

function setReactInputValue(el: EditableEl, nextValue: string, caretPos?: number) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, nextValue);
  else el.value = nextValue;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (typeof caretPos === 'number') {
    try {
      el.setSelectionRange(caretPos, caretPos);
    } catch {
      // Ignore inputs that reject selection range updates.
    }
  }
}

export function InputContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (!isEditableInput(e.target)) {
        setMenu(null);
        return;
      }
      const target = e.target;
      target.focus();
      const sel = getSelectionRange(target);
      const hasSelection = sel.supported ? sel.end > sel.start : target.value.length > 0;
      const isPassword = target instanceof HTMLInputElement && target.type.toLowerCase() === 'password';
      const x = Math.min(e.clientX, window.innerWidth - 188);
      const y = Math.min(e.clientY, window.innerHeight - 160);
      setMenu({
        x: Math.max(8, x),
        y: Math.max(8, y),
        target,
        hasSelection,
        hasValue: target.value.length > 0,
        editable: !target.readOnly,
        isPassword,
      });
    };

    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setMenu(null);
    };
    const close = () => setMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };

    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('blur', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('blur', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (!menu) return null;

  const { target } = menu;
  const runCopy = async (cutAfter: boolean) => {
    const sel = getSelectionRange(target);
    const selectedText = sel.supported ? target.value.slice(sel.start, sel.end) : target.value;
    setMenu(null);
    if (!selectedText || menu.isPassword) return;
    await api.writeClipboardText(selectedText).catch(() => {});
    if (cutAfter && menu.editable) {
      const next = sel.supported
        ? target.value.slice(0, sel.start) + target.value.slice(sel.end)
        : '';
      setReactInputValue(target, next, sel.supported ? sel.start : 0);
    }
  };

  const runPaste = async () => {
    const sel = getSelectionRange(target);
    setMenu(null);
    if (!menu.editable) return;
    const clip = await api.readClipboardText().catch(() => '');
    if (!clip) return;
    const next = sel.supported
      ? target.value.slice(0, sel.start) + clip + target.value.slice(sel.end)
      : clip;
    const caret = sel.supported ? sel.start + clip.length : next.length;
    setReactInputValue(target, next, caret);
  };

  const runSelectAll = () => {
    setMenu(null);
    target.focus();
    target.select();
  };

  const items = [
    { label: 'Cut', shortcut: 'Ctrl+X', Icon: Scissors, disabled: !menu.editable || !menu.hasSelection || menu.isPassword, onClick: () => void runCopy(true) },
    { label: 'Copy', shortcut: 'Ctrl+C', Icon: Copy, disabled: !menu.hasSelection || menu.isPassword, onClick: () => void runCopy(false) },
    { label: 'Paste', shortcut: 'Ctrl+V', Icon: Clipboard, disabled: !menu.editable, onClick: () => void runPaste() },
    { label: 'Select All', shortcut: 'Ctrl+A', Icon: TextSelect, disabled: !menu.hasValue, onClick: runSelectAll },
  ];

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Text editing menu"
      style={{ left: menu.x, top: menu.y }}
      onMouseDown={(e) => {
        e.preventDefault();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 w-44 bg-[#1c202a] border border-[#323949] rounded-sm p-1 space-y-0.5 select-none"
    >
      {items.map(({ label, shortcut, Icon, disabled, onClick }) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'w-full px-2.5 py-1.5 rounded-sm text-xs flex items-center justify-between gap-2 transition-colors text-left',
            disabled
              ? 'text-zinc-500 opacity-45 cursor-not-allowed'
              : 'text-zinc-200 hover:bg-[#282e3c] hover:text-white cursor-pointer'
          )}
        >
          <span className="flex items-center gap-2">
            <Icon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>{label}</span>
          </span>
          <span className="text-[11px] font-mono text-zinc-500">{shortcut}</span>
        </button>
      ))}
    </div>
  );
}
