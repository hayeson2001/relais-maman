import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, createBrowserRouter } from './router.tsx'
import { useSession, type Role } from './session/SessionContext.tsx'
import { Home } from './pages/public/Home.tsx'
import { Activate, BeneficiaryLogin, StaffLogin } from './pages/public/Login.tsx'
import { BeneficiaryHome } from './pages/beneficiary/BeneficiaryHome.tsx'
import { NewRequest } from './pages/beneficiary/NewRequest.tsx'
import { RequestDetail } from './pages/beneficiary/RequestDetail.tsx'
import { Settings } from './pages/beneficiary/Settings.tsx'

// Espaces du personnel chargés à la demande : une maman ne télécharge pas leur code.
const Queue = lazy(() => import('./pages/agent/Queue.tsx').then((m) => ({ default: m.Queue })))
const AgentRequest = lazy(() => import('./pages/agent/AgentRequest.tsx').then((m) => ({ default: m.AgentRequest })))
const Beneficiaries = lazy(() => import('./pages/agent/Beneficiaries.tsx').then((m) => ({ default: m.Beneficiaries })))
const FacilityHome = lazy(() => import('./pages/facility/FacilityHome.tsx').then((m) => ({ default: m.FacilityHome })))
const AdminHome = lazy(() => import('./pages/admin/AdminHome.tsx').then((m) => ({ default: m.AdminHome })))

export function homePath(role: Role) {
  return { BENEFICIARY: '/b', AGENT: '/agent', FACILITY_REFERENT: '/structure', ADMIN: '/admin' }[role]
}

/**
 * Garde d'affichage uniquement : la VRAIE protection est côté serveur (chaque route API
 * contrôle rôle et périmètre). Masquer une page ne suffit pas et n'est pas suffisant.
 */
function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const { me, loading } = useSession()
  if (loading) return null
  if (!me) return <Navigate to={role === 'BENEFICIARY' ? '/connexion' : '/equipe'} replace />
  if (me.role !== role) return <Navigate to={homePath(me.role)} replace />
  return <Suspense fallback={<p>…</p>}>{children}</Suspense>
}

export const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/connexion', element: <BeneficiaryLogin /> },
  { path: '/activation', element: <Activate /> },
  { path: '/equipe', element: <StaffLogin /> },
  { path: '/b', element: <Guard role="BENEFICIARY"><BeneficiaryHome /></Guard> },
  { path: '/b/demande', element: <Guard role="BENEFICIARY"><NewRequest /></Guard> },
  { path: '/b/demande/:id', element: <Guard role="BENEFICIARY"><RequestDetail /></Guard> },
  { path: '/b/preferences', element: <Guard role="BENEFICIARY"><Settings /></Guard> },
  { path: '/agent', element: <Guard role="AGENT"><Queue /></Guard> },
  { path: '/agent/demande/:id', element: <Guard role="AGENT"><AgentRequest /></Guard> },
  { path: '/agent/beneficiaires', element: <Guard role="AGENT"><Beneficiaries /></Guard> },
  { path: '/structure', element: <Guard role="FACILITY_REFERENT"><FacilityHome /></Guard> },
  { path: '/admin', element: <Guard role="ADMIN"><AdminHome /></Guard> },
  { path: '*', element: <Navigate to="/" replace /> },
])
