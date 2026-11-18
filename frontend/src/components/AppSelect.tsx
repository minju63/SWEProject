import { useState } from "react";

type AppSelectProps = {
  label?: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  compact?: boolean;
  disabled?: boolean;
};

export default function AppSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "선택해주세요",
  compact = false,
  disabled = false,
}: AppSelectProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={label ? "block" : ""}>
      {label && <p className={`${compact ? "text-[10px]" : "text-xs"} font-bold text-black/45`}>{label}</p>}
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        className={`flex w-full items-center justify-between gap-2 rounded-xl bg-[#f3f4f7] text-left font-bold transition active:scale-[0.99] disabled:opacity-40 ${label ? "mt-2" : ""} ${compact ? "px-3 py-2.5 text-[10px] text-[color:var(--accent,#2F7BF5)]" : "px-3 py-3 text-sm text-black"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`min-w-0 truncate ${value ? "" : "text-black/30"}`}>{value || placeholder}</span>
        <svg className="size-4 shrink-0 text-[color:var(--accent,#2F7BF5)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/25" onClick={() => setOpen(false)}>
          <div className="w-full max-w-[480px] rounded-t-[28px] bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto h-1 w-10 rounded-full bg-black/15" />
            <div className="mb-4 mt-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black">{label || "항목 선택"}</h2>
                <p className="mt-1 text-[10px] font-medium text-black/35">원하는 항목을 선택해주세요.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-full bg-[#f3f4f6] text-lg text-black/50" aria-label="선택창 닫기">×</button>
            </div>
            <div className="no-scrollbar max-h-[50vh] space-y-2 overflow-y-auto pb-1" role="listbox">
              {options.map((option) => {
                const selected = option === value;
                return (
                  <button
                    type="button"
                    key={option}
                    onClick={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left text-sm font-bold transition ${selected ? "bg-[color:var(--accent-soft,#f1f3fb)] text-[color:var(--accent,#2F7BF5)]" : "bg-[#f7f8fa] text-black/55"}`}
                    role="option"
                    aria-label={option}
                    aria-selected={selected}
                  >
                    {option}
                    <span aria-hidden="true" className={`grid size-6 place-items-center rounded-full text-xs font-black ${selected ? "bg-[color:var(--accent,#2F7BF5)] text-white" : "border border-black/10 text-transparent"}`}>✓</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
