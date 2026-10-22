import { useEffect, useState } from 'react';

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
        <rect x="10" y="8" width="28" height="4" rx="1" fill="#2c2c2c" />
        <rect x="10" y="16" width="12" height="4" rx="1" fill="#2c2c2c" />
        <rect x="26" y="16" width="12" height="4" rx="1" fill="#2c2c2c" />
        <rect x="10" y="24" width="28" height="4" rx="1" fill="#c45c26" />
        <rect x="10" y="32" width="12" height="4" rx="1" fill="#2c2c2c" />
        <rect x="26" y="32" width="12" height="4" rx="1" fill="#2c2c2c" />
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
