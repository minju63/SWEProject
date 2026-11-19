import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAlarmInfo, saveAlarmInfo } from '../../api/calendar.js';
import { useToastStore } from '../../store/toastStore';
import { BellFillIcon, ClockIcon } from '../../components/icons.jsx';
import CustomTimeSheet from './CustomTimeSheet.jsx';
import { alarmLabel, alarmWhen, shortDate } from './calendarUtils.js';

// 정책별 알림 설정 (FR-C08~C13): 설정된 알림 목록 + 빠른 추가 칩 + 직접 정하기
export default function AlarmSheet({ policyId, onClose }) {
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const info = useQuery({
    queryKey: ['alarmInfo', policyId],
    queryFn: () => fetchAlarmInfo(policyId),
  });

  // 위쪽 바를 잡고 아래로 끌어 내리면 닫힌다 (100px 이상 내리면 닫고, 아니면 제자리로)
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
        aria-label="알림 설정"
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
        {info.isLoading && <p className="state">불러오는 중…</p>}
        {info.error && <p className="state">{info.error.message}</p>}
        {info.data && (
          <AlarmEditor
            key={policyId}
            info={info.data}
            onClose={onClose}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ['calendar'] });
              queryClient.invalidateQueries({ queryKey: ['alarmInfo', policyId] });
              showToast('알림을 저장했어요');
              onClose();
            }}
          />
        )}
      </section>
    </div>
  );
}

function AlarmEditor({ info, onClose, onSaved }) {
  const showToast = useToastStore((s) => s.show);
  const dayHour = Number(info.day_alarm_time.slice(0, 2));
  const now = new Date(info.now);
  const presetByCode = new Map(info.presets.map((p) => [p.code, p]));

  // 편집 중인 알림: 저장 버튼을 누르면 한꺼번에 서버에 반영한다
  const [codes, setCodes] = useState(
    () => new Set(info.alarms.filter((a) => a.kind === 'PRESET').map((a) => a.preset_code))
  );
  const [customs, setCustoms] = useState(() =>
    info.alarms
      .filter((a) => a.kind === 'CUSTOM')
      .map((a) => ({ fire_at: a.fire_at, repeat_daily: a.repeat_daily }))
  );
  const [pickingCustom, setPickingCustom] = useState(false);

  const save = useMutation({
    mutationFn: () => saveAlarmInfo(info.policy.policy_id, { presets: [...codes], customs }),
    onSuccess: onSaved,
    onError: (e) => showToast(e.message),
  });

  const toggle = (code) =>
    setCodes((cur) => {
      const next = new Set(cur);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  // 설정된 알림 목록: 알림 시각 순
  const rows = [
    ...[...codes].map((code) => {
      const p = presetByCode.get(code);
      return {
        key: `p-${code}`,
        label: p?.label ?? alarmLabel({ kind: 'PRESET', preset_code: code }, dayHour),
        when: p ? alarmWhen(p.fire_at) : '',
        at: p ? new Date(p.fire_at).getTime() : 0,
        isDefault: p?.is_default,
        remove: () => toggle(code),
      };
    }),
    ...customs.map((c, i) => ({
      key: `c-${c.fire_at}-${i}`,
      label: alarmLabel({ kind: 'CUSTOM', fire_at: c.fire_at, repeat_daily: c.repeat_daily }),
      when: c.repeat_daily
        ? `마감까지 매일 · 첫 알림 ${alarmWhen(c.fire_at)}`
        : alarmWhen(c.fire_at),
      at: new Date(c.fire_at).getTime(),
      isDefault: false,
      remove: () => setCustoms((cur) => cur.filter((_, j) => j !== i)),
    })),
  ].sort((a, b) => a.at - b.at);

  const end = info.policy.application_end_date;
  return (
    <>
      <h2>알림 설정</h2>
      <p className="csheet-sub">
        {info.policy.title}
        <br />
        마감 <b>{shortDate(end)} 23:59</b>
      </p>

      <p className="csheet-label">설정된 알림 {rows.length}</p>
      {rows.length === 0 ? (
        <p className="csheet-empty">아직 설정한 알림이 없어요</p>
      ) : (
        <ul className="alarm-list">
          {rows.map((r) => (
            <li key={r.key}>
              <span className="alarm-ico" aria-hidden="true">
                <BellFillIcon />
              </span>
              <span className="alarm-text">
                <strong>
                  {r.label}
                  {r.isDefault && <em>기본</em>}
                </strong>
                <small>{r.when}</small>
              </span>
              <button type="button" aria-label={`${r.label} 알림 삭제`} onClick={r.remove}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="csheet-label csheet-label-row">
        <span>빠르게 추가</span>
        <em>여러 개 선택 가능</em>
      </p>
      <div className="chip-grid">
        {info.presets.map((p) => {
          const on = codes.has(p.code);
          const past = p.past && !on;
          return (
            <button
              key={p.code}
              type="button"
              className={`achip${on ? ' achip-on' : ''}`}
              disabled={past}
              aria-pressed={on}
              onClick={() => toggle(p.code)}
            >
              {on ? '✓ ' : ''}
              {p.label}
            </button>
          );
        })}
      </div>

      <button type="button" className="custom-add" onClick={() => setPickingCustom(true)}>
        <ClockIcon /> ＋ 날짜·시간 직접 정하기
      </button>

      <div className="csheet-info">
        <p>
          지나간 시점은 고를 수 없어요. 기본 알림도 지우거나 바꿀 수 있어요.
          <br />
          신청 준비 혜택은 마감 3일 전 알림에 <b>남은 서류 개수</b>를 함께 알려드려요.
        </p>
      </div>

      <button
        type="button"
        className="csheet-save csheet-save-wide"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        저장
      </button>

      {pickingCustom && (
        <CustomTimeSheet
          policyTitle={info.policy.title}
          deadlineAt={info.policy.deadline_at}
          endDate={end}
          now={now}
          onCancel={() => setPickingCustom(false)}
          onAdd={(c) => {
            setCustoms((cur) => [...cur, c]);
            setPickingCustom(false);
          }}
        />
      )}
    </>
  );
}
