import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function SelectMenu({ label, value, options, onChange, className = '', menuMinWidth = 0 }) {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState(null);
  const menuId = useId();
  const selectedIndex = options.findIndex((option) => String(option.value) === String(value));
  const selected = options[selectedIndex] ?? options[0];

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function show() {
    const rect = buttonRef.current.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, menuMinWidth), window.innerWidth - 24);
    const roomBelow = window.innerHeight - rect.bottom - 16;
    const above = roomBelow < 180 && rect.top > roomBelow;
    const available = above ? rect.top - 16 : roomBelow;
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: above ? undefined : rect.bottom + 6,
      bottom: above ? window.innerHeight - rect.top + 6 : undefined,
      width,
      maxHeight: Math.max(120, Math.min(300, available - 6)),
    });
    setActive(Math.max(selectedIndex, 0));
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.focus();
    const current = menuRef.current?.querySelector('[aria-selected="true"]');
    if (current) menuRef.current.scrollTop = current.offsetTop - 60;
    function onPointerDown(event) {
      if (!buttonRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    }
    function onScroll(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    }
    function onResize() { setOpen(false); }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  function choose(option) {
    onChange(String(option.value));
    close();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Home') { event.preventDefault(); setActive(0); }
    else if (event.key === 'End') { event.preventDefault(); setActive(options.length - 1); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(options[active]); }
    else if (event.key === 'Tab') setOpen(false);
  }

  useEffect(() => {
    if (!open || !menuRef.current) return;
    const item = menuRef.current.querySelector('[data-active="true"]');
    if (!item) return;
    const menu = menuRef.current;
    if (item.offsetTop < menu.scrollTop) menu.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = item.offsetTop + item.offsetHeight - menu.clientHeight;
    }
  }, [active, open]);

  return <>
    <button ref={buttonRef} type="button" className={`select-menu-trigger ${className}`} aria-label={`${label}: ${selected.label}`}
      aria-haspopup="listbox" aria-expanded={open} onClick={() => open ? close() : show()}
      onKeyDown={(event) => {
        if (!open && ['ArrowDown', 'ArrowUp', ' ', 'Enter'].includes(event.key)) { event.preventDefault(); show(); }
      }}>
      <span>{selected.label}</span><span className="select-menu-chevron" aria-hidden="true" />
    </button>
    {open && position && createPortal(
      <div ref={menuRef} className="select-menu-options" role="listbox" aria-label={label}
        aria-activedescendant={`${menuId}-${active}`} tabIndex={-1}
        style={position} onKeyDown={onKeyDown}>
        {options.map((option, index) => <button type="button" role="option" key={String(option.value)}
          id={`${menuId}-${index}`} aria-selected={index === selectedIndex} data-active={index === active} className="select-menu-option"
          onMouseEnter={() => setActive(index)} onClick={() => choose(option)}>
          <span>{option.label}</span>{index === selectedIndex && <span className="select-menu-check" aria-hidden="true">✓</span>}
        </button>)}
      </div>, document.body)}
  </>;
}
