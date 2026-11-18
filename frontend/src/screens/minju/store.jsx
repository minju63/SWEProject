import { useEffect, useState } from 'react'
import { NOW, POLICIES, DEFAULT_LIKES, DEFAULT_ALARMS, DEFAULT_SETTINGS } from './data'
export { NOW, POLICIES, QUICK } from './data'
const OFFSET = {
  '1주 전': 7 * 864e5,
  '3일 전': 3 * 864e5,
  '1일 전': 864e5,
  '1시간 전': 36e5,
  '30분 전': 18e5,
}
export function alarmTime(label, deadline) {
  if (label === '당일 9시') {
    const d = new Date(deadline)
    d.setHours(9, 0, 0, 0)
    return d
  }
  if (label in OFFSET) return new Date(deadline.getTime() - OFFSET[label])
  return null // custom label
}
export const isPast = (label, deadline) => {
  const t = alarmTime(label, deadline)
  return !!t && t < NOW
}
function useLocal(key, init, ok) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key)
      const v = s ? JSON.parse(s) : null
      return ok(v) ? v : init
    } catch {
      return init
    }
  })
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(v))
  }, [key, v])
  return [v, setV]
}
export function useFavStore() {
  const [likes, setLikes] = useLocal(
    'minju_likes',
    DEFAULT_LIKES,
    (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')
  )
  const [alarms, setAlarms] = useLocal(
    'minju_alarms',
    DEFAULT_ALARMS,
    (v) =>
      !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(Array.isArray)
  )
  const [settings, setSettings] = useLocal(
    'minju_settings',
    DEFAULT_SETTINGS,
    (v) => !!v && Array.isArray(v.auto) && Array.isArray(v.receive) && v.receive.length === 3
  )
  const like = (id) => {
    setLikes((l) => (l.includes(id) ? l : [...l, id]))
    setAlarms((a) => ({
      ...a,
      [id]: settings.auto.filter((x) => !isPast(x, POLICIES.find((p) => p.id === id).deadline)),
    }))
  }
  const unlike = (id) => {
    const snap = { likes, alarms }
    setLikes((l) => l.filter((x) => x !== id))
    setAlarms((a) => {
      const n = { ...a }
      delete n[id]
      return n
    })
    return () => {
      setLikes(snap.likes)
      setAlarms(snap.alarms)
    }
  }
  const setPolicyAlarms = (id, list) => setAlarms((a) => ({ ...a, [id]: list }))
  return { likes, alarms, settings, setSettings, like, unlike, setPolicyAlarms }
}
