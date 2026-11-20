import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type ToastItem = {
  id: string;
  kind: 'ok' | 'error' | 'info';
  text: string;
};

let pushToast: ((t: Omit<ToastItem, 'id'>) => void) | null = null;

export function toast(kind: ToastItem['kind'], text: string) {
  pushToast?.({ kind, text });
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    pushToast = (t) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setItems((x) => [...x, { ...t, id }]);
      window.setTimeout(() => {
        setItems((x) => x.filter((i) => i.id !== id));
      }, t.kind === 'error' ? 4000 : 2000);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  if (!items.length) return null;
  return (
    <div className="toast-host" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.text}
          <button
            type="button"
            className="toast-x"
            aria-label="关闭"
            onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>
        <rect x="10" y="8" width="28" height="4" rx="1" fill="#2a2520" />
        <rect x="10" y="16" width="12" height="4" rx="1" fill="#2a2520" />
        <rect x="26" y="16" width="12" height="4" rx="1" fill="#2a2520" />
        <rect x="10" y="24" width="28" height="4" rx="1" fill="#b23a2e" />
        <rect x="10" y="32" width="12" height="4" rx="1" fill="#2a2520" />
        <rect x="26" y="32" width="12" height="4" rx="1" fill="#2a2520" />
      </svg>
      <strong>{title}</strong>
      {desc && <p className="muted">{desc}</p>}
      {action}
    </div>
  );
}

export function SkeletonRows({ n = 3 }: { n?: number }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  );
}

/** 统一确认框（替代 window.confirm；Esc 由调用方控制，遮罩可点） */
export function ConfirmDialog({
  open,
  title,
  desc,
  confirmLabel = '确定',
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  desc?: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <div className="modal-mask" role="presentation" onClick={onCancel}>
      <div
        className="modal-card confirm-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        {desc ? <p className="muted">{desc}</p> : null}
        <div className="row">
          <button
            type="button"
            className={danger ? 'danger' : 'primary'}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? '处理中…' : confirmLabel}
          </button>
          <button type="button" className="ghost" disabled={busy} onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 统一输入对话框（替代 window.prompt） */
export function PromptDialog({
  open,
  title,
  label,
  placeholder,
  defaultValue,
  confirmLabel = '确定',
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue ?? '');
  useEffect(() => {
    if (open) setValue(defaultValue ?? '');
  }, [open, defaultValue]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  const submit = () => {
    const v = value.trim();
    if (v) onConfirm(v);
  };
  return createPortal(
    <div className="modal-mask" role="presentation" onClick={onCancel}>
      <div
        className="modal-card confirm-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        {label ? (
          <label className="prompt-label">
            {label}
            <input
              autoFocus
              value={value}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          </label>
        ) : (
          <input
            autoFocus
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        )}
        <div className="row">
          <button type="button" className="primary" disabled={busy || !value.trim()} onClick={submit}>
            {busy ? '处理中…' : confirmLabel}
          </button>
          <button type="button" className="ghost" disabled={busy} onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
