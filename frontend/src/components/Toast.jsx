import { useToastStore } from '../store/toastStore';

export default function Toast() {
  const toast = useToastStore((s) => s.toast);
  const hide = useToastStore((s) => s.hide);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action.onClick();
            hide();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
