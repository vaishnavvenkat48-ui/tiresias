import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, WarningCircle, Info, X } from '@phosphor-icons/react';

const ToastContext = createContext(null);

const ICONS = { success: CheckCircle, error: WarningCircle, info: Info };

/** Lightweight feedback toasts — bottom-right on desktop, above the tab bar on phones. */
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback((message, { type = 'info', action, duration = 3800 } = {}) => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-3), { id, message, type, action }]);
    if (duration) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-[90] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2 lg:bottom-6 lg:right-6" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = ICONS[t.type] || Info;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                className="surface-sm pointer-events-auto flex items-start gap-3 p-3 pr-2"
              >
                <Icon size={18} weight="fill" className={t.type === 'error' ? 'mt-0.5 text-danger' : t.type === 'success' ? 'mt-0.5 text-success' : 'mt-0.5 text-accent'} />
                <p className="flex-1 text-[13px] leading-snug text-fg">{t.message}</p>
                {t.action && (
                  <button className="btn btn-sm" onClick={() => { t.action.onClick(); dismiss(t.id); }}>{t.action.label}</button>
                )}
                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Dismiss" onClick={() => dismiss(t.id)}><X size={14} /></button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};
