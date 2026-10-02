import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from './AppLayout'
import { DiaryRoute } from './routes/DiaryRoute'
import { FoodsRoute } from './routes/FoodsRoute'
import { MetricsRoute } from './routes/MetricsRoute'

/**
 * URL is state: the selected diary date lives in the route, so refresh, back
 * and deep links all do the obvious thing (one of the long-standing papercuts
 * in the current vanilla SPA).
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/diary" replace /> },
      { path: 'diary', element: <DiaryRoute /> },
      { path: 'diary/:date', element: <DiaryRoute /> },
      { path: 'foods', element: <FoodsRoute /> },
      { path: 'metrics', element: <MetricsRoute /> },
      { path: '*', element: <Navigate to="/diary" replace /> },
    ],
  },
])
