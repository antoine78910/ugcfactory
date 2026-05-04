"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AtSign, Music2, VideoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type MentionElementOption = {
  id: string;
  name: string;
  description?: string;
  /** When set, shown on the inline chip instead of the formatted @name (e.g. “Product”, “Avatar”). */
  chipLabel?: string;
  previewUrl?: string;
  previewKind?: "image" | "video" | "audio";
};

/** Group @-mention options behind a tab strip (one category visible at a time). */
export type MentionElementTabConfig = {
  tabs: readonly { id: string; label: string }[];
  getTabId: (el: MentionElementOption) => string;
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
  /** Replaces default Video empty copy when no `elements` exist. */
  emptyElementsHint?: string;
  /** When false, hides “Create element” in the empty state (e.g. Ads Studio). */
  showCreateElementButton?: boolean;
  /** When set, dropdown shows one tab at a time (e.g. Attached vs Avatar library in Ads Studio). */
  mentionTabs?: MentionElementTabConfig;
  /** Thin visible scrollbar instead of fully hidden (e.g. Ads Studio prompt). */
  minimalScrollbar?: boolean;
  /**
   * Padding, font-size, line-height, min/max height, etc. applied to both the textarea and the
   * highlight mirror. Keeps the caret aligned with rendered @-mentions (must not live only on
   * the bordered wrapper while the mirror uses `absolute inset-0`).
   */
  copySyncClassName?: string;
  /** Extra classes for the `<textarea>` only (caret, placeholder, etc.). */
  textareaClassName?: string;
};

/**
 * Default padding + type scale shared by textarea and highlight mirror (not on the border wrapper).
 * Avoid `md:leading-*` here so callers (e.g. Ads Studio `leading-relaxed`) stay consistent at every breakpoint.
 */
const TEXTAREA_COPY_LAYOUT = "px-3 py-2 text-base leading-normal md:text-sm";

/** Vertical scrollbar consumes width inside the textarea but not in the mirror layer — line wraps drift without this. */
function verticalScrollbarReserveX(el: HTMLTextAreaElement): number {
  const style = getComputedStyle(el);
  const bl = parseFloat(style.borderLeftWidth) || 0;
  const br = parseFloat(style.borderRightWidth) || 0;
  return Math.max(0, Math.round(el.offsetWidth - el.clientWidth - bl - br));
}

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

function findMentionRangeAroundCursor(
  value: string,
  cursor: number,
): { start: number; end: number; token: string } | null {
  const mentionRe = /@([a-zA-Z0-9_]+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = mentionRe.exec(value)) !== null) {
    const full = m[0]!;
    const token = m[1]!;
    const start = m.index;
    const end = start + full.length;
    if (cursor >= start && cursor <= end + 1) {
      return { start, end, token };
    }
  }
  return null;
}

function buildMentionOverlayNodes(
  text: string,
  elements: MentionElementOption[],
  formatLabel: (name: string) => string,
): ReactNode {
  const mentionByName = new Map(
    elements.map((el) => [el.name.trim().toLowerCase(), el] as const),
  );
  const nodes: React.ReactNode[] = [];
  const mentionRe = /@([a-zA-Z0-9_]+)\b/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = mentionRe.exec(text)) !== null) {
    const atIndex = m.index;
    const full = m[0]!;
    const rawName = m[1]!;
    if (atIndex > cursor) {
      nodes.push(<span key={`txt-${cursor}`}>{text.slice(cursor, atIndex)}</span>);
    }
    const opt = mentionByName.get(rawName.toLowerCase());
    if (!opt) {
      nodes.push(<span key={`raw-${atIndex}`}>{full}</span>);
    } else {
      const kind = opt.previewKind ?? "image";
      const chipClass =
        "inline-flex h-5 items-center gap-0.5 rounded-md bg-white/[0.06] px-0.5 align-middle";
      const labelClass = "whitespace-nowrap text-[12px] font-medium tracking-[-0.01em] text-white/92";
      nodes.push(
        <span key={`chip-wrap-${atIndex}-${opt.id}`} className="relative inline-block align-baseline">
          {/* Reserve exactly the raw token width used by the real textarea caret. */}
          <span className="invisible">{full}</span>
          <span className={`pointer-events-none absolute left-0 top-1/2 flex h-5 w-full -translate-y-1/2 items-center overflow-hidden ${chipClass}`}>
            <span className="relative h-3 w-3 shrink-0 overflow-hidden rounded-[3px] bg-black/45">
              {opt.previewUrl && kind === "video" ? (
                <video
                  src={opt.previewUrl}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : opt.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={opt.previewUrl} alt="" className="h-full w-full object-cover" />
              ) : kind === "audio" ? (
                <span className="flex h-full w-full items-center justify-center text-white/70">
                  <Music2 className="h-2.5 w-2.5" aria-hidden />
                </span>
              ) : kind === "video" ? (
                <span className="flex h-full w-full items-center justify-center text-white/70">
                  <VideoIcon className="h-2.5 w-2.5" aria-hidden />
                </span>
              ) : (
                <span className="flex h-full w-full items-center justify-center text-white/70">
                  <AtSign className="h-2.5 w-2.5" aria-hidden />
                </span>
              )}
            </span>
            <span className={`min-w-0 truncate ${labelClass}`}>
              {opt.chipLabel?.trim() ? opt.chipLabel.trim() : formatLabel(opt.name)}
            </span>
          </span>
        </span>,
      );
    }
    cursor = atIndex + full.length;
  }
  if (cursor < text.length) {
    nodes.push(<span key={`txt-tail-${cursor}`}>{text.slice(cursor)}</span>);
  }
  return <>{nodes}</>;
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
  emptyElementsHint,
  showCreateElementButton = true,
  mentionTabs,
  minimalScrollbar = false,
  copySyncClassName,
  textareaClassName,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [mentionTabId, setMentionTabId] = useState("");
  const [token, setToken] = useState("");
  const [tokenStart, setTokenStart] = useState<number | null>(null);
  const [overlayScrollTop, setOverlayScrollTop] = useState(0);
  const [overlayScrollLeft, setOverlayScrollLeft] = useState(0);
  const [scrollbarReserveX, setScrollbarReserveX] = useState(0);

  const measureScrollbarReserve = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    setScrollbarReserveX(verticalScrollbarReserveX(el));
  }, []);

  useLayoutEffect(() => {
    measureScrollbarReserve();
    /** One extra frame: layout after long programmatic paste (e.g. Recreate) so mirror width matches textarea. */
    const id = window.requestAnimationFrame(() => measureScrollbarReserve());
    return () => window.cancelAnimationFrame(id);
  }, [measureScrollbarReserve, value]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measureScrollbarReserve());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureScrollbarReserve]);

  const filtered = useMemo(() => {
    const items = elements.filter((e) => e.name.trim().length > 0);
    const t = token.trim().toLowerCase();
    if (!t) return items;
    const starts = items.filter((e) => {
      const n = e.name.toLowerCase();
      const chip = (e.chipLabel ?? "").toLowerCase();
      const desc = (e.description ?? "").toLowerCase();
      return n.startsWith(t) || chip.startsWith(t) || desc.startsWith(t);
    });
    const contains = items.filter((e) => {
      const n = e.name.toLowerCase();
      const chip = (e.chipLabel ?? "").toLowerCase();
      const desc = (e.description ?? "").toLowerCase();
      if (n.startsWith(t) || chip.startsWith(t) || desc.startsWith(t)) return false;
      return n.includes(t) || chip.includes(t) || desc.includes(t);
    });
    return [...starts, ...contains];
  }, [elements, token]);

  const effectiveMentionTabId = useMemo(() => {
    if (!mentionTabs) return "";
    const { tabs, getTabId } = mentionTabs;
    if (mentionTabId && filtered.some((e) => getTabId(e) === mentionTabId)) return mentionTabId;
    const first = tabs.find((t) => filtered.some((e) => getTabId(e) === t.id));
    return first?.id ?? tabs[0]?.id ?? "";
  }, [mentionTabs, mentionTabId, filtered]);

  const displayedFiltered = useMemo(() => {
    if (!mentionTabs) return filtered;
    if (!effectiveMentionTabId) return filtered;
    return filtered.filter((e) => mentionTabs.getTabId(e) === effectiveMentionTabId);
  }, [filtered, mentionTabs, effectiveMentionTabId]);

  const menuHighlightIdx =
    open && displayedFiltered.length > 0 ? Math.min(activeIdx, displayedFiltered.length - 1) : 0;

  const closeMenu = useCallback(() => {
    setOpen(false);
    setToken("");
    setTokenStart(null);
    setActiveIdx(0);
    setMentionTabId("");
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
    const ta = e.currentTarget;
    const selStart = ta.selectionStart ?? value.length;
    const selEnd = ta.selectionEnd ?? selStart;
    const hasSelection = selEnd > selStart;

    if (!hasSelection && (e.key === "Backspace" || e.key === "Delete")) {
      const probeCursor = e.key === "Backspace" ? selStart : selStart + 1;
      const mention = findMentionRangeAroundCursor(value, probeCursor);
      if (mention && mentionByName.has(mention.token.toLowerCase())) {
        e.preventDefault();
        const removeStart = mention.start;
        let removeEnd = mention.end;
        if (value[removeEnd] === " ") removeEnd += 1;
        const next = value.slice(0, removeStart) + value.slice(removeEnd);
        onChange(next);
        closeMenu();
        requestAnimationFrame(() => {
          if (!textareaRef.current) return;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(removeStart, removeStart);
        });
        return;
      }
    }

    if (!open) return;
    if (displayedFiltered.length === 0 && e.key !== "Escape") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % displayedFiltered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + displayedFiltered.length) % displayedFiltered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const pick = displayedFiltered[menuHighlightIdx];
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

  useEffect(() => {
    if (!mentionTabs) return;
    setActiveIdx(0);
  }, [mentionTabId, mentionTabs]);

  const mentionByName = new Map(
    elements.map((el) => [el.name.trim().toLowerCase(), el] as const),
  );

  const formatMentionLabel = useCallback((name: string) => {
    const n = name.trim();
    const seedance = /^(image|video|audio)(\d+)$/i.exec(n);
    if (seedance) {
      const kind = seedance[1]!;
      return `${kind[0]!.toUpperCase()}${kind.slice(1).toLowerCase()} ${seedance[2]}`;
    }
    return n;
  }, []);

  const renderedOverlay = value ? buildMentionOverlayNodes(value, elements, formatMentionLabel) : null;

  function renderFilteredMentionList() {
    if (filtered.length === 0) return null;
    if (displayedFiltered.length > 0) {
      return (
        <ul className="max-h-[14rem] overflow-y-auto py-1">
          {displayedFiltered.map((el, i) => (
            <li key={el.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === menuHighlightIdx}
                className={cn(
                  "flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition",
                  i === menuHighlightIdx ? "bg-violet-500/20" : "hover:bg-white/[0.05]",
                )}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => handleSelect(el)}
              >
                <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/50">
                  {el.previewUrl && el.previewKind === "video" ? (
                    <video
                      src={el.previewUrl}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : el.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={el.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : el.previewKind === "audio" ? (
                    <span className="flex h-full w-full items-center justify-center text-white/40">
                      <Music2 className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  ) : el.previewKind === "video" ? (
                    <span className="flex h-full w-full items-center justify-center text-white/40">
                      <VideoIcon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-white/40">
                      <AtSign className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-white/88">
                    {el.chipLabel?.trim() ?? `@${el.name.trim()}`}
                  </span>
                  {el.chipLabel?.trim() ? (
                    <span className="block truncate font-mono text-[10px] text-white/40">
                      @{el.name.trim()}
                    </span>
                  ) : el.description?.trim() ? (
                    <span className="block truncate text-[10px] text-white/40">{el.description.trim()}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      );
    }
    if (mentionTabs) {
      return (
        <div className="px-3 py-3 text-xs text-white/50">
          No matches in this tab. Switch category or adjust your filter.
        </div>
      );
    }
    return null;
  }

  return (
    <div
      className={cn(
        "relative",
        /** Lift above sibling panels (e.g. Studio Parameters model row) while the menu overflows downward. */
        showMenu && "z-[300]",
      )}
    >
      {/**
       * Border wrapper has no padding: an `absolute inset-0` mirror would otherwise align to the
       * padding edge while the textarea’s text starts in the content box, breaking caret alignment.
       */}
      <div
        className={cn(
          "relative min-h-16 overflow-hidden rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]",
          className,
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onKeyUp={refreshFromCaret}
          onClick={refreshFromCaret}
          spellCheck={false}
          onScroll={(e) => {
            const t = e.currentTarget;
            setOverlayScrollTop(t.scrollTop);
            setOverlayScrollLeft(t.scrollLeft);
            measureScrollbarReserve();
          }}
          onBlur={() => {
            /** Delay so a click inside the dropdown can land before we close. */
            window.setTimeout(closeMenu, 120);
          }}
          onWheelCapture={(e) => {
            const el = e.currentTarget;
            const canScroll = el.scrollHeight > el.clientHeight;
            if (!canScroll) return;
            e.preventDefault();
            el.scrollTop += e.deltaY;
            setOverlayScrollTop(el.scrollTop);
            setOverlayScrollLeft(el.scrollLeft);
            measureScrollbarReserve();
            e.stopPropagation();
          }}
          placeholder={placeholder}
          rows={rows}
          data-slot="textarea"
          className={cn(
            TEXTAREA_COPY_LAYOUT,
            copySyncClassName,
            // Match the overlay wrapping rules exactly so clicks/caret map to the same visual line/column.
            "relative z-10 box-border block min-h-16 min-w-0 w-full resize-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent shadow-none outline-none ring-0",
            minimalScrollbar ? "studio-minimal-scrollbar" : "studio-params-scroll",
            "border-0 placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0 aria-invalid:border-transparent aria-invalid:ring-destructive/20 dark:bg-transparent dark:aria-invalid:ring-destructive/40",
            "disabled:cursor-not-allowed disabled:opacity-50",
            /** Ghost overlay: hide native text; spellcheck squiggles misalign when text is transparent. */
            value
              ? "text-transparent [-webkit-text-fill-color:transparent] caret-white selection:bg-white/25"
              : "",
            textareaClassName,
          )}
        />
        {value ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]"
          >
            <div
              className={cn(
                TEXTAREA_COPY_LAYOUT,
                copySyncClassName,
                "w-full whitespace-pre-wrap break-words text-white",
              )}
              style={{
                transform: `translate(${-overlayScrollLeft}px, ${-overlayScrollTop}px)`,
                paddingRight: scrollbarReserveX,
              }}
            >
              {renderedOverlay}
            </div>
          </div>
        ) : null}
      </div>
      {showMenu ? (
        <div
          className="absolute left-0 right-0 top-full z-[200] mt-1 overflow-hidden rounded-xl border border-white/12 bg-[#0b0912]/98 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur"
          role="listbox"
          /** Prevents blur before the click actually fires. */
          onMouseDown={(e) => e.preventDefault()}
        >
          {mentionTabs && filtered.length > 0 ? (
            <div
              role="tablist"
              aria-label="Reference groups"
              className="flex flex-wrap gap-1 border-b border-white/10 px-2 pb-2 pt-1"
            >
              {mentionTabs.tabs.map((t) => {
                const count = filtered.filter((e) => mentionTabs.getTabId(e) === t.id).length;
                const active = t.id === effectiveMentionTabId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setMentionTabId(t.id)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition sm:text-[11px]",
                      active
                        ? "border-violet-400/45 bg-violet-500/25 text-violet-100"
                        : "border-white/10 bg-white/[0.04] text-white/55 hover:border-white/18 hover:bg-white/[0.07] hover:text-white/80",
                    )}
                  >
                    {t.label}
                    <span className="ml-1 tabular-nums text-white/45">({count})</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {filtered.length > 0 ? (
            renderFilteredMentionList()
          ) : (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-xs text-white/55">
                {emptyElementsHint ?? "No elements saved yet."}
              </span>
              {showCreateElementButton && onCreateNew ? (
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
