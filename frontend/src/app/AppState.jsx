import { createContext, useContext } from 'react'
import { useWorkspaceState } from './useWorkspaceState'
const AppStateContext = createContext(null)
export function AppStateProvider({ children }) {
  const state = useWorkspaceState()
  return <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>
}
export function useAppState() {
  const value = useContext(AppStateContext)
  if (!value) throw new Error('AppStateProvider missing')
  return value
}
export function todayISO() {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}
export function formatDate(v) {
  return v.split('-').join('.')
}
