import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDaysKey,
  diffDays,
  clockLabel,
  dateKey,
  kstParts,
  kstToDate,
  parseKey,
  remainingText,
  shortDate,
} from './calendarUtils.js';

const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);

// 휠 느낌의 한 칸 목록: 고른 값이 가운데 하이라이트에 오도록 스크롤한다
function Column({ title, options, value, onChange, width }) {
  const ref = useRef(null);
  const index = options.findIndex((o) => o.value === value);
  useEffect(() => {
    const el = ref.current;
    if (el && index >= 0) el.scrollTo({ top: Math.max(0, index * 38 - 76), behavior: 'auto' });
  }, [index]);
  return (
    <div className="wheel-col" style={{ flex: width }}>
      <p>{title}</p>
      <div className="wheel-list" ref={ref} role="listbox" aria-label={title}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={o.value === value}
            className={o.value === value ? 'wheel-on' : ''}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// 알림 직접 정하기 (FR-C10, FR-C11, FR-C13): 오늘부터 마감일까지, 지난 시각·마감 이후는 고를 수 없다
export default function CustomTimeSheet({
  policyTitle,
  deadlineAt,
  endDate,
  now,
  onCancel,
  onAdd,
}) {
  const nowDate = useMemo(() => new Date(now), [now]);
  const today = (() => {
    const p = kstParts(nowDate);
    return dateKey(p.y, p.m, p.d);
  })();
  const days = Math.max(0, diffDays(today, endDate));
  const dateOptions = Array.from({ length: days + 1 }, (_, i) => {
    const key = addDaysKey(today, i);
    return { value: key, label: shortDate(key) };
  });

  // 처음 값: 지금부터 1시간 뒤(5분 단위 올림), 마감을 넘으면 마감 30분 전
  const initial = useMemo(() => {
    let t = new Date(Math.ceil((nowDate.getTime() + 60 * 60000) / 300000) * 300000);
    if (t > new Date(deadlineAt)) t = new Date(new Date(deadlineAt).getTime() - 30 * 60000);
    const p = kstParts(t);
    return {
      date: dateKey(p.y, p.m, p.d),
      pm: p.h >= 12,
      hour: p.h % 12 === 0 ? 12 : p.h % 12,
      min: p.min - (p.min % 5),
    };
  }, [nowDate, deadlineAt]);

  const [date, setDate] = useState(initial.date);
  const [pm, setPm] = useState(initial.pm);
  const [hour, setHour] = useState(initial.hour);
  const [min, setMin] = useState(initial.min);
  const [repeat, setRepeat] = useState(false);

  const { y, m, d } = parseKey(date);
  const h24 = (hour % 12) + (pm ? 12 : 0);
  const fireAt = kstToDate(y, m, d, h24, min);
  const past = fireAt <= nowDate;
  const afterDeadline = fireAt > new Date(deadlineAt);
  const valid = !past && !afterDeadline;

  // 매일 반복: 고른 날부터 마감일까지 같은 시각 (마감 이후는 제외)
  const repeatTimes = [];
  for (let i = 0; i <= days; i += 1) {
    const k = parseKey(addDaysKey(date, i));
    const t = kstToDate(k.y, k.m, k.d, h24, min);
    if (t > nowDate && t <= new Date(deadlineAt)) repeatTimes.push(t);
  }

  return (
    <div className="csheet-dim csheet-dim-top" onClick={onCancel}>
      <section
        className="csheet csheet-custom"
        role="dialog"
        aria-label="알림 직접 정하기"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="csheet-handle">
          <span />
        </div>
        <h2>직접 정하기</h2>
        <p className="csheet-sub">
          {policyTitle} · 마감 <b>{shortDate(endDate)} 23:59</b>
        </p>

        <div className="wheel">
          <Column title="날짜" options={dateOptions} value={date} onChange={setDate} width={1.6} />
          <Column
            title="오전/오후"
            options={[
              { value: false, label: '오전' },
              { value: true, label: '오후' },
            ]}
            value={pm}
            onChange={setPm}
            width={1.1}
          />
          <Column
            title="시"
            options={HOURS.map((v) => ({ value: v, label: String(v) }))}
            value={hour}
            onChange={setHour}
            width={0.7}
          />
          <Column
            title="분"
            options={MINUTES.map((v) => ({ value: v, label: String(v).padStart(2, '0') }))}
            value={min}
            onChange={setMin}
            width={0.7}
          />
        </div>

        <p className={`csheet-first${valid ? '' : ' csheet-first-bad'}`}>
          🔔{' '}
          {past
            ? '지난 시각은 고를 수 없어요'
            : afterDeadline
              ? '마감 이후 시각은 고를 수 없어요'
              : `첫 알림: 마감 ${remainingText(fireAt, deadlineAt)}`}
        </p>

        <label className="csheet-repeat">
          <span>
            <strong>마감까지 매일 이 시간에 반복</strong>
            <em>
              {valid && repeatTimes.length > 0
                ? `${shortDate(date).slice(0, 5)} ~ ${shortDate(addDaysKey(date, repeatTimes.length - 1)).slice(0, 5)} 매일 ${clockLabel(fireAt)} · 총 ${repeatTimes.length}번 울려요`
                : '시각을 먼저 골라 주세요'}
            </em>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
          />
        </label>

        <p className="csheet-note">
          오늘({shortDate(today).slice(0, 5)})부터 마감일까지만 고를 수 있어요. 지난 시각과 마감
          이후 시각은 고를 수 없어요.
        </p>

        <div className="csheet-actions">
          <button type="button" className="csheet-cancel" onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            className="csheet-save"
            disabled={!valid}
            onClick={() => onAdd({ fire_at: fireAt.toISOString(), repeat_daily: repeat })}
          >
            알림 추가
          </button>
        </div>
      </section>
    </div>
  );
}
