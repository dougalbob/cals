import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from './AppLayout'
import { HomeRoute } from './routes/HomeRoute'

/**
 * URL is state: the selected diary date lives in the route, so refresh, back
 * and deep links all do the obvious thing (one of the long-standing papercuts
 * in the current vanilla SPA).
 *
 * Every page except Home (the landing route) is lazy-loaded, so each route is
 * its own chunk: visiting Metrics no longer downloads Recipes and vice versa,
 * and future growth in any one page stays inside that page's chunk. The shared
 * React/router chunks are cached once across navigations (decision 101).
 */
const DiaryRoute = lazy(() =>
  import('./routes/DiaryRoute').then((m) => ({ default: m.DiaryRoute })),
)
const CalendarRoute = lazy(() =>
  import('./routes/CalendarRoute').then((m) => ({ default: m.CalendarRoute })),
)
const FoodsRoute = lazy(() =>
  import('./routes/FoodsRoute').then((m) => ({ default: m.FoodsRoute })),
)
const RecipesRoute = lazy(() =>
  import('./routes/RecipesRoute').then((m) => ({ default: m.RecipesRoute })),
)
const RecipeCreateRoute = lazy(() =>
  import('./routes/RecipeCreateRoute').then((m) => ({ default: m.RecipeCreateRoute })),
)
const RecipeDetailRoute = lazy(() =>
  import('./routes/RecipeDetailRoute').then((m) => ({ default: m.RecipeDetailRoute })),
)
const MetricsRoute = lazy(() =>
  import('./routes/MetricsRoute').then((m) => ({ default: m.MetricsRoute })),
)
const NutritionRoute = lazy(() =>
  import('./routes/NutritionRoute').then((m) => ({ default: m.NutritionRoute })),
)
const DrinksRoute = lazy(() =>
  import('./routes/DrinksRoute').then((m) => ({ default: m.DrinksRoute })),
)

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
        { path: 'nutrition', element: <NutritionRoute /> },
        { path: 'drinks', element: <DrinksRoute /> },
        { path: '*', element: <Navigate to="/diary" replace /> },
      ],
    },
  ],
  { basename },
)
