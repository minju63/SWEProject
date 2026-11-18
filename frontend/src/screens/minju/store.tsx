import { useEffect, useState } from "react"

import {
  NOW,
  POLICIES,
  DEFAULT_LIKES,
  DEFAULT_ALARMS,
  DEFAULT_SETTINGS,
  type Settings,
} from "./data"
export { NOW, POLICIES, QUICK, type Policy, type Settings } from "./data"

const OFFSET: Record<string, number> = {
  "1주 전": 7 * 864e5,
  "3일 전": 3 * 864e5,
  "1일 전": 864e5,
  "1시간 전": 36e5,
  "30분 전": 18e5,
}

export function alarmTime(label: string, deadline: Date) {
  if (label === "당일 9시") {
    const d = new Date(deadline)
    d.setHours(9, 0, 0, 0)
    return d
  }
  if (label in OFFSET) return new Date(deadline.getTime() - OFFSET[label])
  return null // custom label
}
export const isPast = (label: string, deadline: Date) => {
  const t = alarmTime(label, deadline)
  return !!t && t < NOW
}

function useLocal<T>(key: string, init: T, ok: (v: any) => boolean) {
  const [v, setV] = useState<T>(() => {
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
  return [v, setV] as const
}

export function useFavStore() {
  const [likes, setLikes] = useLocal<string[]>(
    "minju_likes",
    DEFAULT_LIKES,
    (v) => Array.isArray(v) && v.every((x) => typeof x === "string"),
  )
  const [alarms, setAlarms] = useLocal<Record<string, string[]>>(
    "minju_alarms",
    DEFAULT_ALARMS,
    (v) =>
      !!v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      Object.values(v).every(Array.isArray),
  )
  const [settings, setSettings] = useLocal<Settings>(
    "minju_settings",
    DEFAULT_SETTINGS,
    (v) =>
      !!v &&
      Array.isArray(v.auto) &&
      Array.isArray(v.receive) &&
      v.receive.length === 3,
  )

  const like = (id: string) => {
    setLikes((l) => (l.includes(id) ? l : [...l, id]))
    setAlarms((a) => ({
      ...a,
      [id]: settings.auto.filter(
        (x) => !isPast(x, POLICIES.find((p) => p.id === id)!.deadline),
      ),
    }))
  }
  const unlike = (id: string) => {
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
  const setPolicyAlarms = (id: string, list: string[]) =>
    setAlarms((a) => ({ ...a, [id]: list }))

  return { likes, alarms, settings, setSettings, like, unlike, setPolicyAlarms }
}
export type FavStore = ReturnType<typeof useFavStore>
