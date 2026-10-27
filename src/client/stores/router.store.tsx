import {
  type Child,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'hono/jsx/dom'

export const APP_ROUTES = [
  '/',
  '/pos',
  '/catalog',
  '/inventory',
  '/purchases',
  '/customers',
  '/sales',
  '/shifts',
  '/users',
  '/system',
] as const

export type AppRoute = (typeof APP_ROUTES)[number]

function normalizePathToRoute(pathname: string): AppRoute {
  const cleaned =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if ((APP_ROUTES as readonly string[]).includes(cleaned)) {
    return cleaned as AppRoute
  }
  return '/'
}

interface RouterContextValue {
  readonly currentRoute: AppRoute
  readonly navigate: (route: AppRoute, options?: { replace?: boolean }) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

export function RouterProvider(props: { children: Child }) {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() =>
    normalizePathToRoute(window.location.pathname),
  )

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(normalizePathToRoute(window.location.pathname))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((route: AppRoute, options?: { replace?: boolean }) => {
    if (window.location.pathname !== route) {
      if (options?.replace) {
        window.history.replaceState(null, '', route)
      } else {
        window.history.pushState(null, '', route)
      }
    }
    setCurrentRoute(route)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [])

  const value = useMemo<RouterContextValue>(
    () => ({ currentRoute, navigate }),
    [currentRoute, navigate],
  )

  return <RouterContext.Provider value={value}>{props.children}</RouterContext.Provider>
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext)
  if (!ctx) {
    throw new Error('useRouter must be used within RouterProvider')
  }
  return ctx
}
