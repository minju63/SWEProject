import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
export default function PressPasswordInput({ label, ...props }) {
  const [shown, setShown] = useState(false);
  return (
    <label className="signup-label">
      {label}
      <span className="signup-password-wrapper">
        <input {...props} className="signup-input" type={shown ? 'text' : 'password'} />
        <button
          type="button"
          className="signup-password-toggle"
          aria-label={`${label} ${shown ? '숨기기' : '보기'}`}
          aria-pressed={shown}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setShown(true);
          }}
          onPointerUp={() => setShown(false)}
          onPointerCancel={() => setShown(false)}
          onPointerLeave={() => setShown(false)}
          onBlur={() => setShown(false)}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              setShown(true);
            }
          }}
          onKeyUp={() => setShown(false)}
        >
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}
