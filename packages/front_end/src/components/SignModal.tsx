import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { SignBoard, type SignBoardProps } from './SignBoard';

export type SignModalProps = {
  open: boolean;
  onClose: () => void;
  sign: SignBoardProps;
};

const MIN_SCALE = 0.72;
const FIT_WIDTH = 360;

function isInside(el: EventTarget | null, root: HTMLElement | null): boolean {
  if (!el || !root) return false;
  return el instanceof Node && root.contains(el);
}

/**
 * C1：Portal@body · 视口居中 · SignBoard 等比 scale（min 0.72）+ 占位高度
 * 「收」不缩放；scale 到下限仍超高时 scroller 滚。
 */
export function SignModal({ open, onClose, sign }: SignModalProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fitRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<Element | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const didForwardScrollRef = useRef(false);

  const applyFit = useCallback(() => {
    const scroller = scrollRef.current;
    const board = boardRef.current;
    const fit = fitRef.current;
    const inner = innerRef.current;
    if (!scroller || !board || !fit || !inner) return;

    inner.style.transform = 'none';
    fit.style.height = 'auto';
    fit.style.width = 'auto';
    const contentH = board.offsetHeight;
    const contentW = board.offsetWidth || FIT_WIDTH;
    const cs = getComputedStyle(scroller);
    const padY =
      (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const availH = Math.max(120, scroller.clientHeight - padY);
    const next = Math.min(1, Math.max(MIN_SCALE, availH / Math.max(contentH, 1)));
    const used = Number.isFinite(next) ? next : 1;

    inner.style.transform = `scale(${used})`;
    fit.style.height = `${Math.ceil(contentH * used)}px`;
    fit.style.width = `${Math.ceil(contentW * used)}px`;
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    applyFit();
  }, [open, applyFit, sign]);

  useEffect(() => {
    if (!open) return;
    const scroller = scrollRef.current;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => applyFit());
    });
    if (scroller) ro.observe(scroller);
    if (boardRef.current) ro.observe(boardRef.current);
    const onWin = () => requestAnimationFrame(() => applyFit());
    window.addEventListener('resize', onWin);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onWin);
    };
  }, [open, applyFit]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    didForwardScrollRef.current = false;
    pointerStartRef.current = null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const root = rootRef.current;
    const scroller = scrollRef.current;

    const onWheel = (e: WheelEvent) => {
      if (!scroller) return;
      if (isInside(e.target, scroller)) return;
      // 内容已适配到一屏时无需转发
      if (scroller.scrollHeight <= scroller.clientHeight + 1) return;
      e.preventDefault();
      const s =
        e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientHeight : 1;
      scroller.scrollTop += e.deltaY * s;
      if (Math.abs(e.deltaY) > 0.5) didForwardScrollRef.current = true;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const list = Array.from(
          root?.querySelectorAll<HTMLElement>(
            'button, [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        );
        if (!list.length) return;
        const first = list[0]!;
        const last = list[list.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey) {
          if (active === first || !root?.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !root?.contains(active)) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 1) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
      const step = Math.max(40, scroller.clientHeight * 0.8);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        scroller.scrollTop += 40;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        scroller.scrollTop -= 40;
      } else if (e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        scroller.scrollTop += step;
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        scroller.scrollTop -= step;
      } else if (e.key === 'Home') {
        e.preventDefault();
        scroller.scrollTop = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        scroller.scrollTop = scroller.scrollHeight;
      }
    };

    const maskEl = root?.querySelector('.sign-modal-mask');
    const onPointerDown = (e: PointerEvent) => {
      if (e.target !== maskEl) {
        pointerStartRef.current = null;
        return;
      }
      pointerStartRef.current = { x: e.clientX, y: e.clientY };
      didForwardScrollRef.current = false;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.target !== maskEl) {
        pointerStartRef.current = null;
        return;
      }
      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      if (!start || didForwardScrollRef.current) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) <= 6) onClose();
    };

    root?.addEventListener('wheel', onWheel, { passive: false });
    root?.addEventListener('pointerdown', onPointerDown);
    root?.addEventListener('pointerup', onPointerUp);
    document.addEventListener('keydown', onKey, true);

    return () => {
      root?.removeEventListener('wheel', onWheel);
      root?.removeEventListener('pointerdown', onPointerDown);
      root?.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      const el = returnFocusRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') {
        (el as HTMLElement).focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={rootRef}
      className="sign-modal-root"
      role="dialog"
      aria-modal="true"
      aria-label="签牌"
    >
      <div className="sign-modal-mask" aria-hidden="true" />
      <div className="sign-modal-panel">
        <div className="sign-modal-bar">
          <button
            ref={closeRef}
            type="button"
            className="ghost sm sign-modal-close"
            onClick={onClose}
          >
            收
          </button>
        </div>
        <div
          ref={scrollRef}
          className="sign-modal-scroller"
          tabIndex={0}
          role="region"
          aria-label="签文"
        >
          <div ref={fitRef} className="sign-modal-fit">
            <div ref={innerRef} className="sign-modal-fit-inner">
              <div ref={boardRef}>
                <SignBoard {...sign} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default SignModal;
