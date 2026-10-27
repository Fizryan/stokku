import {
  type Child,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'hono/jsx/dom'
import { hasPermission, type Permission } from '../../shared/constants.js'
import type { InitialSetupInput, LoginInput } from '../../shared/schemas/index.js'
import type { UserDTO } from '../../shared/types.js'
import { api, registerUnauthorizedHandler } from '../api/client.js'
import { useToast } from './toast.store.js'

interface AuthContextValue {
  readonly isBootstrapping: boolean
  readonly needsInitialSetup: boolean
  readonly user: UserDTO | null
  readonly can: (permission: Permission) => boolean
  readonly refreshSession: () => Promise<void>
  readonly completeInitialSetup: (input: InitialSetupInput) => Promise<void>
  readonly login: (input: LoginInput) => Promise<void>
  readonly logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider(props: { children: Child }) {
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [needsInitialSetup, setNeedsInitialSetup] = useState(false)
  const [user, setUser] = useState<UserDTO | null>(null)
  const { showToast } = useToast()

  const refreshSession = useCallback(async () => {
    try {
      const status = await api.auth.getSession()
      setNeedsInitialSetup(status.needsInitialSetup)
      setUser(status.user)
    } catch {
      setUser(null)
    } finally {
      setIsBootstrapping(false)
    }
  }, [])

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setUser(null)
      showToast('Sesi Anda telah berakhir. Silakan login kembali.', 'warning')
    })
    void refreshSession()
  }, [refreshSession, showToast])

  const completeInitialSetup = useCallback(async (input: InitialSetupInput) => {
    const res = await api.auth.setupOwner(input)
    setNeedsInitialSetup(false)
    setUser(res.user)
  }, [])

  const login = useCallback(async (input: LoginInput) => {
    const res = await api.auth.login(input)
    setNeedsInitialSetup(false)
    setUser(res.user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const can = useCallback(
    (permission: Permission): boolean => {
      if (!user) return false
      return hasPermission(user.role, permission)
    },
    [user],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      isBootstrapping,
      needsInitialSetup,
      user,
      can,
      refreshSession,
      completeInitialSetup,
      login,
      logout,
    }),
    [
      isBootstrapping,
      needsInitialSetup,
      user,
      can,
      refreshSession,
      completeInitialSetup,
      login,
      logout,
    ],
  )

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
