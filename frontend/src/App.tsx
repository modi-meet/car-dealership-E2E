import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import Layout from './components/Layout'
import { NotFound } from './components/States'
import { RequireRole, type Role } from './lib/auth'
import Cars from './pages/Cars'
import Home from './pages/Home'
import Login from './pages/Login'
import ModelPage from './pages/ModelPage'
import Privacy from './pages/Privacy'
import TestDrive from './pages/TestDrive'
import UsedDetail from './pages/UsedDetail'
import UsedList from './pages/UsedList'

// staff screens load on demand, buyers on 4g never download them
const Desk = lazy(() => import('./pages/Desk'))
const LeadPage = lazy(() => import('./pages/LeadPage'))
const DeskImport = lazy(() => import('./pages/DeskImport'))
const Admin = lazy(() => import('./pages/admin/Admin'))

function Staff({ roles, children }: { roles: Role[]; children: ReactNode }) {
  return (
    <RequireRole roles={roles}>
      <Suspense fallback={<div className="wrap pt-10"><div className="skeleton h-10 w-56" /></div>}>{children}</Suspense>
    </RequireRole>
  )
}

const DESK: Role[] = ['consultant', 'admin']

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/login', element: <Login /> },
      { path: '/cars', element: <Cars /> },
      { path: '/cars/:slug', element: <ModelPage /> },
      { path: '/used', element: <UsedList /> },
      { path: '/used/:stockId', element: <UsedDetail /> },
      { path: '/test-drive', element: <TestDrive /> },
      { path: '/privacy', element: <Privacy /> },
      { path: '/desk', element: <Staff roles={DESK}><Desk /></Staff> },
      { path: '/desk/leads/:id', element: <Staff roles={DESK}><LeadPage /></Staff> },
      { path: '/desk/import', element: <Staff roles={DESK}><DeskImport /></Staff> },
      { path: '/admin', element: <Staff roles={['admin']}><Admin /></Staff> },
      { path: '*', element: <NotFound /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
