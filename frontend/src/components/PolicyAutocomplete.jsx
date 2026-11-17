import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPolicySuggestions } from '../api/policies';
import { useAuthStore } from '../store/authStore';
import './PolicyAutocomplete.css';

function Highlight({ text, match }) {
  const start = text.toLocaleLowerCase().indexOf(match.toLocaleLowerCase());
  if (start < 0) return text;
  return <>{text.slice(0, start)}<mark>{text.slice(start, start + match.length)}</mark>{text.slice(start + match.length)}</>;
}

export default function PolicyAutocomplete({ value, onChange, onSearch, onSelectPolicy, onSelectTerm,
  context = 'search', basePolicyId, renderInput, liveSuggestions = false, inlineSuggestions = false,
  alwaysOpen = false }) {
  const user = useAuthStore((state) => state.user);
  const wrapper = useRef(null);
  const listId = useId();
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [composing, setComposing] = useState(false);
  const query = value.trim();
  const suggestionQuery = liveSuggestions ? query : debounced;
  const minLength = liveSuggestions ? 1 : 2;

  useEffect(() => {
    if (liveSuggestions || composing || [...query].length < 2) return;
    const timer = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(timer);
  }, [query, composing, liveSuggestions]);

  useEffect(() => {
    const closeOnOutside = (event) => {
      if (!wrapper.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, []);

  const suggestions = useQuery({
    queryKey: ['policy-suggestions', user?.id, context, basePolicyId, suggestionQuery],
    queryFn: ({ signal }) => fetchPolicySuggestions({ q: suggestionQuery, context,
      ...(context === 'compare' ? { basePolicyId } : {}) }, signal),
    enabled: Boolean(user && (liveSuggestions || !composing) && [...query].length >= minLength && suggestionQuery === query),
    staleTime: 30_000,
    retry: false,
  });
  const ready = suggestionQuery === query;
  const visible = (open || alwaysOpen) && Boolean(user) && (liveSuggestions || !composing) &&
    [...query].length >= minLength && (liveSuggestions || ready);
  const entries = visible && ready ? [
    ...(suggestions.data?.relatedSearches ?? []).map((item) => ({ ...item, type: 'term' })),
    ...(suggestions.data?.policies ?? []).map((item) => ({ ...item, type: 'policy' })),
  ] : [];

  function choose(entry) {
    setOpen(false);
    setActive(-1);
    if (entry.type === 'policy') onSelectPolicy(entry);
    else if (onSelectTerm) onSelectTerm(entry.text);
    else onSearch(entry.text);
  }

  function submit() {
    setOpen(false);
    setActive(-1);
    onSearch(query);
  }

  const inputProps = {
    value,
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': visible,
    'aria-controls': visible ? listId : undefined,
    'aria-activedescendant': active >= 0 && entries.length ? `${listId}-${active}` : undefined,
    onChange: (event) => {
      onChange(event.target.value);
      if (!liveSuggestions && [...event.target.value.trim()].length < 2) setDebounced('');
      setActive(-1); setOpen(true);
    },
    onFocus: () => setOpen(true),
    onClick: () => setOpen(true),
    onCompositionStart: () => {
      setComposing(true);
      if (!liveSuggestions) { setDebounced(''); setOpen(false); }
      else setOpen(true);
    },
    onCompositionEnd: (event) => { setComposing(false); onChange(event.currentTarget.value); setOpen(true); },
    onKeyDown: (event) => {
      if (composing || event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { setOpen(false); setActive(-1); return; }
      if (event.key === 'ArrowDown' && entries.length) {
        event.preventDefault();
        setActive((index) => (index + 1) % entries.length);
      } else if (event.key === 'ArrowUp' && entries.length) {
        event.preventDefault();
        setActive((index) => index <= 0 ? entries.length - 1 : index - 1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (active >= 0 && entries[active]) choose(entries[active]);
        else submit();
      }
    },
  };

  return <div className={`policy-autocomplete${inlineSuggestions ? ' policy-autocomplete--inline' : ''}`} ref={wrapper}>
    {renderInput(inputProps, submit)}
    {visible && <div className="policy-suggestions" id={listId} role="listbox" aria-label="정책 자동완성">
      {(!ready || suggestions.isPending) && <p className="policy-suggestions-state">관련 제안을 찾는 중이에요…</p>}
      {ready && suggestions.isError && <p className="policy-suggestions-state">제안을 불러오지 못했어요. Enter로 검색할 수 있어요.</p>}
      {ready && suggestions.isSuccess && entries.length === 0 && <p className="policy-suggestions-state">관련 제안이 없어요. Enter로 검색해 보세요.</p>}
      {ready && suggestions.isSuccess && entries.map((entry, index) => <div key={`${entry.type}-${entry.policy_id ?? entry.text}`}
        className="policy-suggestions-entry" role="presentation">
        {(index === 0 || entries[index - 1].type !== entry.type) &&
          <div className="policy-suggestions-group">{entry.type === 'term' ? '관련 검색어' : '실제 정책'}</div>}
        <button id={`${listId}-${index}`} type="button" role="option" aria-selected={active === index}
          className={active === index ? 'is-active' : ''}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(entry)}>
          <Highlight text={entry.type === 'term' ? entry.text : entry.title} match={entry.match} />
        </button>
      </div>)}
    </div>}
  </div>;
}
