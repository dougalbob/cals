import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from './AppLayout'
import { DiaryRoute } from './routes/DiaryRoute'
import { FoodsRoute } from './routes/FoodsRoute'
import { DrinksRoute } from './routes/DrinksRoute'
import { HomeRoute } from './routes/HomeRoute'
import { MetricsRoute } from './routes/MetricsRoute'
import { RecipesRoute } from './routes/RecipesRoute'
import { RecipeCreateRoute } from './routes/RecipeCreateRoute'
import { RecipeDetailRoute } from './routes/RecipeDetailRoute'
import { CalendarRoute } from './routes/CalendarRoute'

/**
 * URL is state: the selected diary date lives in the route, so refresh, back
 * and deep links all do the obvious thing (one of the long-standing papercuts
 * in the current vanilla SPA).
 */
const basename =
  import.meta.env.BASE_URL === '/' ? '/' : import.meta.env.BASE_URL.replace(/\/$/, '')

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppLayout />,
      children: [
        { index: true, element: <HomeRoute /> },
        { path: 'today', element: <HomeRoute /> },
        { path: 'diary', element: <DiaryRoute /> },
        { path: 'diary/:date', element: <DiaryRoute /> },
        { path: 'calendar', element: <CalendarRoute /> },
        { path: 'calendar/:view/:anchor', element: <CalendarRoute /> },
        { path: 'foods', element: <FoodsRoute /> },
        { path: 'recipes', element: <RecipesRoute /> },
        { path: 'recipes/new', element: <RecipeCreateRoute /> },
        { path: 'recipes/:id', element: <RecipeDetailRoute /> },
        { path: 'metrics', element: <MetricsRoute /> },
        { path: 'drinks', element: <DrinksRoute /> },
        { path: '*', element: <Navigate to="/diary" replace /> },
      ],
    },
  ],
  { basename },
)
