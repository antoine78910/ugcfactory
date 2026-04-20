"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AtSign } from "lucide-react";
import { cn } from "@/lib/utils";

export type MentionElementOption = {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  elements: MentionElementOption[];
  /** Fires when the user picks an element from the dropdown. */
  onPickElement?: (el: MentionElementOption) => void;
  /** Fires when the empty-state "Create element" shortcut is clicked. */
  onCreateNew?: () => void;
};

/**
 * Walks backwards from `cursor` to find an in-progress `@token` at the caret.
 * Returns the token (without `@`) and the index of the `@` if the caret is within one; otherwise null.
 */
function extractMentionAtCursor(
  value: string,
  cursor: number,
): { token: string; start: number } | null {
  let i = cursor;
  while (i > 0) {
    const ch = value[i - 1]!;
    if (ch === "@") {
      return { token: value.slice(i, cursor), start: i - 1 };
    }
    if (/\s/.test(ch)) return null;
    i -= 1;
  }
  return null;
}

/**
 * Textarea with an `@mention` autocomplete for saved video Elements (Higgsfield-style).
 *
 * While the user types `@foo` the dropdown filters the supplied `elements` by name prefix/substring.
 * Arrow keys / Enter / Tab / Esc are handled like a combobox; clicking an option replaces the token
 * with `@name ` and restores focus to the textarea at the new caret position.
 */
export default function ElementMentionTextarea({
  value,
  onChange,
  placeholder,
  className,
  rows,
  elements,
  onPickElement,
  onCreateNew,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [token, setToken] = useState("");
  const [tokenStart, setTokenStart] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const items = elements.filter((e) => e.name.trim().length > 0);
    const t = token.trim().toLowerCase();
    if (!t) return items;
    const starts = items.filter((e) => e.name.toLowerCase().startsWith(t));
    const contains = items.filter(
      (e) => !e.name.toLowerCase().startsWith(t) && e.name.toLowerCase().includes(t),
    );
    return [...starts, ...contains];
  }, [elements, token]);

  useEffect(() => {
    if (!open) {
      setActiveIdx(0);
      return;
    }
    setActiveIdx((idx) => Math.min(idx, Math.max(0, filtered.length - 1)));
  }, [filtered.length, open]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setToken("");
    setTokenStart(null);
  }, []);

  const updateMentionFromState = useCallback(
    (nextValue: string, cursor: number) => {
      const m = extractMentionAtCursor(nextValue, cursor);
      if (m) {
        setOpen(true);
        setToken(m.token);
        setTokenStart(m.start);
      } else {
        closeMenu();
      }
    },
    [closeMenu],
  );

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);
    /** Defer: selectionStart reflects the post-change caret only after the browser commits the edit. */
    window.setTimeout(() => {
      if (!textareaRef.current) return;
      updateMentionFromState(next, textareaRef.current.selectionStart ?? next.length);
    }, 0);
  }

  function handleSelect(el: MentionElementOption) {
    if (!textareaRef.current || tokenStart === null) return;
    const ta = textareaRef.current;
    const before = value.slice(0, tokenStart);
    const cursor = ta.selectionStart ?? value.length;
    const after = value.slice(cursor);
    const insert = `@${el.name.trim()} `;
    const next = before + insert + after;
    onChange(next);
    closeMenu();
    const newCursor = before.length + insert.length;
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(newCursor, newCursor);
    });
    onPickElement?.(el);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (filtered.length === 0 && e.key !== "Escape") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const pick = filtered[activeIdx];
      if (pick) handleSelect(pick);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
    }
  }

  function refreshFromCaret() {
    if (!textareaRef.current) return;
    updateMentionFromState(value, textareaRef.current.selectionStart ?? value.length);
  }

  const hasAnyElements = elements.some((e) => e.name.trim().length > 0);
  const showMenu =
    open && (filtered.length > 0 || (!hasAnyElements && token.length === 0));

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={refreshFromCaret}
        onClick={refreshFromCaret}
        onBlur={() => {
          /** Delay so a click inside the dropdown can land before we close. */
          window.setTimeout(closeMenu, 120);
        }}
        placeholder={placeholder}
        rows={rows}
        data-slot="textarea"
        className={cn(
          "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
      />
      {showMenu ? (
        <div
          className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-white/12 bg-[#0b0912]/98 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur"
          role="listbox"
          /** Prevents blur before the click actually fires. */
          onMouseDown={(e) => e.preventDefault()}
        >
          {filtered.length > 0 ? (
            <ul className="max-h-[14rem] overflow-y-auto py-1">
              {filtered.map((el, i) => (
                <li key={el.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === activeIdx}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition",
                      i === activeIdx ? "bg-violet-500/20" : "hover:bg-white/[0.05]",
                    )}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => handleSelect(el)}
                  >
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/50">
                      {el.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={el.previewUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-white/40">
                          <AtSign className="h-3.5 w-3.5" aria-hidden />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-white/88">
                        @{el.name.trim()}
                      </span>
                      {el.description?.trim() ? (
                        <span className="block truncate text-[10px] text-white/40">
                          {el.description.trim()}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-xs text-white/55">No elements saved yet.</span>
              {onCreateNew ? (
                <button
                  type="button"
                  onClick={() => {
                    closeMenu();
                    onCreateNew();
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-violet-400/40 bg-violet-500/15 px-2 py-1 text-[11px] font-semibold text-violet-100 transition hover:bg-violet-500/25"
                >
                  Create element
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
