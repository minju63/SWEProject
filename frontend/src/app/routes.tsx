import { useLayoutEffect } from "react"
import { createBrowserRouter, Outlet, useLocation } from "react-router"
import TabBar from "../components/TabBar"
import PolicyDataGate from "./PolicyDataGate"

function HydrateFallback() {
  return (
    <div className="min-h-screen bg-[#eef0f5]">
      <div className="mx-auto flex min-h-screen max-w-[480px] items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <span className="grid size-10 -rotate-6 place-items-center rounded-[13px] bg-[#2F7BF5] text-base font-black text-white">
            Y
          </span>
          <span className="text-xs font-bold text-black/35">
            청년ZIP을 불러오고 있어요
          </span>
        </div>
      </div>
    </div>
  )
}

function AppRoot() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    if (!/^\/policies\/[^/]+$/.test(pathname)) return
    const prev = window.history.scrollRestoration
    window.history.scrollRestoration = "manual"
    const top = () => window.scrollTo(0, 0)
    top()
    const raf = requestAnimationFrame(top)
    const timers = [50, 150, 400].map((ms) => window.setTimeout(top, ms))
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      window.history.scrollRestoration = prev
    }
  }, [pathname])
  const isSearch = pathname === "/search" || pathname === "/search/input"
  const isPolicy = /^\/policies\/[^/]+(?:\/compare\/(?:select|[^/]+))?$/.test(pathname)
  if (isSearch || isPolicy) return (
    <div className={`app${isSearch ? " app--search" : " app--detail"}`}>
      <main className="page"><Outlet /></main>
      <TabBar />
    </div>
  )
  return <PolicyDataGate><Outlet /></PolicyDataGate>
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppRoot,
    HydrateFallback,
    children: [
      {path:'login',lazy:async()=>({Component:(await import('../screens/LoginScreen')).default})},
      {path:'events',lazy:async()=>({Component:(await import('../screens/CultureEventsScreen')).default})},
      {
        path: "signup",
        HydrateFallback,
        lazy: async () => ({ Component: (await import("../screens/SignupScreen")).default }),
      },
      {
        path: "auth/confirm",
        HydrateFallback,
        lazy: async () => ({ Component: (await import("../screens/AuthConfirmScreen")).default }),
      },
      {
        index: true,
        HydrateFallback,
        lazy: async () => {
          const { default: Component } = await import(
            "../screens/minju/HomeScreen"
          )
          return { Component }
        },
      },
      {
        path: "search",
        HydrateFallback,
        lazy: async () => {
          const { default: Component } = await import("../pages/search/SearchPage")
          return { Component }
        },
      },
      {
        path: "search/input",
        HydrateFallback,
        lazy: async () => ({ Component: (await import("../pages/search/SearchInputPage")).default }),
      },
      {
        path: "policies/:policyId",
        HydrateFallback,
        lazy: async () => {
          const { default: Component } = await import(
            "../pages/common/PolicyDetailPage"
          )
          return { Component }
        },
      },
      {
        path: "policies/:policyId/compare/select",
        HydrateFallback,
        lazy: async () => {
          const { default: Component } = await import(
            "../pages/common/PolicyComparePage"
          )
          return { Component }
        },
      },
      {
        path: "policies/:policyId/compare/:comparisonId",
        HydrateFallback,
        lazy: async () => {
          const { default: Component } = await import(
            "../pages/common/PolicyComparePage"
          )
          return { Component }
        },
      },
      {
        path: "settings",
        HydrateFallback,
        lazy: async () => {
          const { default: Component } = await import(
            "../screens/SettingsScreen"
          )
          return { Component }
        },
      },
      {
        path: "my",
        HydrateFallback,
        lazy: async () => {
          const { default: Component } = await import("../screens/MyScreen")
          return { Component }
        },
      },
      {
        path: "presentation",
        HydrateFallback,
        lazy: async () => {
          const { default: Component } = await import(
            "../screens/PresentationScreen"
          )
          return { Component }
        },
      },
      {
        path: "map",
        HydrateFallback,
        lazy: async () => {
          const { default: Component } = await import("../screens/MapScreen")
          return { Component }
        },
      },
      {
        path: "calendar",
        HydrateFallback,
        lazy: async () => {
          const { default: Component } = await import(
            "../screens/CalendarScreen"
          )
          return { Component }
        },
      },
      {
        path: "settings/alarm",
        HydrateFallback,
        lazy: async () => {
          const { default: Component } = await import(
            "../screens/minju/AlarmSettings"
          )
          return { Component }
        },
      },
      {
        path: "notifications",
        HydrateFallback,
        lazy: async () => {
          const { default: Component } = await import(
            "../screens/NotificationsScreen"
          )
          return { Component }
        },
      },
      {
        path: "*",
        HydrateFallback,
        lazy: async () => {
          const { default: Component } = await import("../screens/HomeScreen")
          return { Component }
        },
      },
    ],
  },
])
