import { createBrowserRouter, RouterProvider } from 'react-router'
import Layout from './components/Layout'
import { NotFound } from './components/States'
import { RequireRole } from './lib/auth'
import Home from './pages/Home'
import Login from './pages/Login'

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
      { path: '/cars', element: <Soon name="New cars" /> },
      { path: '/used', element: <Soon name="Used cars" /> },
      { path: '/test-drive', element: <Soon name="Test drive" /> },
      { path: '/privacy', element: <Soon name="Privacy" /> },
      {
        path: '/desk',
        element: (
          <RequireRole roles={['consultant', 'admin']}>
            <Soon name="Lead desk" />
          </RequireRole>
        ),
      },
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
