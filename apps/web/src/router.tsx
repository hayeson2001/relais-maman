import { createContext, useContext, useEffect, useMemo, useRef, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react'

/**
 * Routeur minimal (API History) remplaçant react-router : mesuré à +33 Ko compressés pour
 * 6 fonctions utilisées (docs/architecture.md, « Poids des pages »). Choix réversible :
 * les noms reprennent ceux de react-router pour revenir en arrière sans réécrire les pages.
 */
export interface RouteDef {
  path: string
  element: ReactNode
}

interface RouterState {
  pathname: string
  params: Record<string, string>
  navigate: (to: string, opts?: { replace?: boolean }) => void
}
const RouterContext = createContext<RouterState | null>(null)

function match(pattern: string, pathname: string): Record<string, string> | null {
  if (pattern === '*') return {}
  const p = pattern.split('/').filter(Boolean)
  const s = pathname.split('/').filter(Boolean)
  if (p.length !== s.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    const seg = p[i]!
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(s[i]!)
    else if (seg !== s[i]) return null
  }
  return params
}

export function createBrowserRouter(routes: RouteDef[]) {
  return routes
}

export function RouterProvider({ router }: { router: RouteDef[] }) {
  const [pathname, setPathname] = useState(window.location.pathname)
  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (to: string, opts: { replace?: boolean } = {}) => {
    if (opts.replace) window.history.replaceState(null, '', to)
    else window.history.pushState(null, '', to)
    setPathname(new URL(to, window.location.origin).pathname)
    window.scrollTo(0, 0)
  }

  const { element, params } = useMemo(() => {
    for (const r of router) {
      const params = match(r.path, pathname)
      if (params) return { element: r.element, params }
    }
    return { element: null, params: {} }
  }, [router, pathname])

  // Après une NAVIGATION, le focus va au contenu principal (lecteurs d'écran, clavier).
  // Jamais au premier affichage : le lien « Aller au contenu » doit rester le premier
  // élément atteint avec la touche Tab.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    document.getElementById('contenu')?.focus({ preventScroll: true })
  }, [pathname])

  return <RouterContext.Provider value={{ pathname, params, navigate }}>{element}</RouterContext.Provider>
}

function useRouter() {
  const r = useContext(RouterContext)
  if (!r) throw new Error('RouterProvider manquant')
  return r
}
export const useNavigate = () => useRouter().navigate
export const useParams = <T extends Record<string, string>>() => useRouter().params as Partial<T>
export const useLocation = () => ({ pathname: useRouter().pathname })

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string }

export function Link({ to, onClick, ...rest }: LinkProps) {
  const { navigate } = useRouter()
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handle} {...rest} />
}

export function NavLink(props: LinkProps) {
  const { pathname } = useRouter()
  return <Link {...props} aria-current={pathname === props.to ? 'page' : undefined} />
}

export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const { navigate } = useRouter()
  useEffect(() => navigate(to, { replace }), [to])
  return null
}
