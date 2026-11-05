import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { CoreProvider, useCoreState } from './data/core';
import Layout from './components/Layout';
import ExplorePage from './pages/ExplorePage';

const PlacePage = lazy(() => import('./pages/PlacePage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));
const BudgetPage = lazy(() => import('./pages/BudgetPage'));
const InsightsPage = lazy(() => import('./pages/InsightsPage'));
const InsightPage = lazy(() => import('./pages/InsightPage'));
const ImmigrationPage = lazy(() => import('./pages/ImmigrationPage'));
const UpdatesPage = lazy(() => import('./pages/UpdatesPage'));
const SourcesPage = lazy(() => import('./pages/SourcesPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function Gate({ children }: { children: React.ReactNode }) {
  const s = useCoreState();
  if (s.status === 'loading') return <div className="app-status" role="status">Loading official data…</div>;
  if (s.status === 'error')
    return (
      <div className="app-status" role="alert">
        The data snapshot could not be loaded ({s.error.message}). Run <code>npm run data:build</code> and reload.
      </div>
    );
  return <>{children}</>;
}

export default function App() {
  return (
    <CoreProvider>
      <Layout>
        <Gate>
          <Suspense fallback={<div className="app-status" role="status">Loading…</div>}>
            <Routes>
              <Route path="/" element={<ExplorePage />} />
              <Route path="/place/:placeId" element={<PlacePage />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/budget" element={<BudgetPage />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/insights/:insightId" element={<InsightPage />} />
              <Route path="/immigration" element={<ImmigrationPage />} />
              <Route path="/updates" element={<UpdatesPage />} />
              <Route path="/sources" element={<SourcesPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </Gate>
      </Layout>
    </CoreProvider>
  );
}
