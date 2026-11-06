import { createBrowserRouter, RouterProvider } from 'react-router'
import Layout from './components/Layout'
import { NotFound } from './components/States'
import { RequireRole } from './lib/auth'
import Cars from './pages/Cars'
import Desk from './pages/Desk'
import DeskImport from './pages/DeskImport'
import Home from './pages/Home'
import LeadPage from './pages/LeadPage'
import Login from './pages/Login'
import ModelPage from './pages/ModelPage'
import Privacy from './pages/Privacy'
import TestDrive from './pages/TestDrive'
import UsedDetail from './pages/UsedDetail'
import UsedList from './pages/UsedList'

// temporary stand-in while the real screens get built
function Soon({ name }: { name: string }) {
  return <div className="wrap py-32 text-center text-ink-3">{name} is on its way.</div>
}

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
      ...[
        { path: '/desk', element: <Desk /> },
        { path: '/desk/leads/:id', element: <LeadPage /> },
        { path: '/desk/import', element: <DeskImport /> },
      ].map((r) => ({ ...r, element: <RequireRole roles={['consultant', 'admin']}>{r.element}</RequireRole> })),
      {
        path: '/admin',
        element: (
          <RequireRole roles={['admin']}>
            <Soon name="Admin" />
          </RequireRole>
        ),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
