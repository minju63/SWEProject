import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchAlarmDefaults, saveAlarmDefaults } from '../../api/calendar.js';
import { useToastStore } from '../../store/toastStore';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h) => `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}시`;

// 캘린더 상단 '알림 설정': 새로 찜하거나 신청 준비로 등록하는 정책에 자동으로 붙는 기본 알림을 바꾼다
export default function DefaultAlarmSheet({ onClose }) {
  const defaults = useQuery({ queryKey: ['alarmDefaults'], queryFn: fetchAlarmDefaults });

  // 위쪽 바를 잡고 아래로 끌어 내리면 닫힌다 (100px 이상)
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const onDown = (e) => {
    startY.current = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (dragging) setDragY(Math.max(0, e.clientY - startY.current));
  };
  const onUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragY > 100) onClose();
    else setDragY(0);
  };

  return (
    <div className="csheet-dim" onClick={onClose}>
      <section
        className="csheet"
        role="dialog"
        aria-label="기본 알림 설정"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform 0.18s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="csheet-top">
          <div
            className="csheet-handle"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <span />
          </div>
          <button type="button" className="csheet-x" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>
        {defaults.isLoading && <p className="state">불러오는 중…</p>}
        {defaults.error && <p className="state">{defaults.error.message}</p>}
        {defaults.data && <Editor key="editor" data={defaults.data} onClose={onClose} />}
      </section>
    </div>
  );
}

function Chips({ presets, value, onToggle, dayHour }) {
  return (
    <div className="chip-grid">
      {presets.map((p) => {
        const on = value.includes(p.code);
        const label = p.code === 'DDAY_AM' ? `당일 오전 ${dayHour}시` : p.label;
        return (
          <button
            key={p.code}
            type="button"
            className={`achip${on ? ' achip-on' : ''}`}
            aria-pressed={on}
            onClick={() => onToggle(p.code)}
          >
            {on ? '✓ ' : ''}
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Editor({ data, onClose }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const showToast = useToastStore((s) => s.show);
  const [bookmark, setBookmark] = useState(data.bookmark_presets);
  const [preparing, setPreparing] = useState(data.preparing_presets);
  const [hour, setHour] = useState(Number(data.day_alarm_time.slice(0, 2)));

  const toggle = (setter) => (code) =>
    setter((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));

  const save = useMutation({
    mutationFn: () =>
      saveAlarmDefaults({
        bookmark_presets: bookmark,
        preparing_presets: preparing,
        day_alarm_time: `${String(hour).padStart(2, '0')}:00`,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alarmDefaults'] });
      showToast('기본 알림을 저장했어요');
      onClose();
    },
    onError: (e) => showToast(e.message),
  });

  const empty = bookmark.length === 0 || preparing.length === 0;
  return (
    <>
      <h2>기본 알림 설정</h2>
      <p className="csheet-sub">
        새로 찜하거나 신청 준비로 등록하는 정책부터 적용돼요.
        <br />
        이미 만들어진 알림은 바뀌지 않아요.
      </p>

      <p className="csheet-label">찜한 정책 기본 알림</p>
      <Chips presets={data.presets} value={bookmark} onToggle={toggle(setBookmark)} dayHour={hour} />

      <p className="csheet-label">신청 준비 정책 기본 알림</p>
      <Chips presets={data.presets} value={preparing} onToggle={toggle(setPreparing)} dayHour={hour} />

      <p className="csheet-label">날짜 단위 알림 받는 시각</p>
      <select
        className="alarm-time-select"
        value={hour}
        aria-label="알림 받는 시각"
        onChange={(e) => setHour(Number(e.target.value))}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {hourLabel(h)}
          </option>
        ))}
      </select>
      <p className="csheet-hint">1주 전·3일 전·1일 전·당일 오전 알림은 이 시각에 보내요.</p>

      <div className="csheet-info">
        <p>
          알림 자체를 받을지, 마감 임박 알림을 끌지는{' '}
          <button
            type="button"
            className="csheet-link"
            onClick={() => navigate('/settings?view=notifications')}
          >
            마이 › 알림 설정
          </button>
          에서 정해요.
        </p>
      </div>

      <button
        type="button"
        className="csheet-save csheet-save-wide"
        disabled={save.isPending || empty}
        onClick={() => save.mutate()}
      >
        저장
      </button>
      {empty && <p className="csheet-hint">찜과 신청 준비 모두 알림을 하나 이상 골라 주세요.</p>}
    </>
  );
}
