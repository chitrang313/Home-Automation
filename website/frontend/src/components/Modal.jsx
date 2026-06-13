import { useEffect } from 'react';

/**
 * Lightweight accessible modal — backdrop + centered panel.
 *
 *   - ESC closes
 *   - Click backdrop closes (panel click does NOT)
 *   - Body scroll locked while open
 *   - Trap-light: returns focus to the trigger via the parent's onClose
 */
export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Dialog'}
    >
      {/* Dimmed, blurred backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade"
        onClick={onClose}
      />

      {/* Liquid-glass panel: refractive backdrop · tint · shine · content */}
      <div
        className={
          'lg-wrap animate-modal relative w-full ' +
          maxWidth +
          ' rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto'
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lg-effect" aria-hidden="true" />
        <div className="lg-tint" aria-hidden="true" />
        <div className="lg-shine" aria-hidden="true" />

        <div className="lg-content">
          {title && (
            <div className="sticky top-0 z-10 px-5 py-3.5 flex items-center justify-between border-b border-white/40 bg-white/30 backdrop-blur-md rounded-t-3xl">
              <h3 className="font-semibold text-ink">{title}</h3>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-ink/60 hover:text-ink text-xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/50 transition"
              >×</button>
            </div>
          )}
          <div className="px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
