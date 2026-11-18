import { Routes, Route, useLocation } from 'react-router-dom';
import TabBar from './components/TabBar.jsx';
import AssistantButton from './components/AssistantButton.jsx';
import AssistantSheet from './components/AssistantSheet.jsx';
import Toast from './components/Toast.jsx';
import HomePage from './pages/home/HomePage.jsx';
import SearchPage from './pages/search/SearchPage.jsx';
import SearchInputPage from './pages/search/SearchInputPage.jsx';
import MapPage from './pages/map/MapPage.jsx';
import CalendarPage from './pages/calendar/CalendarPage.jsx';
import MyPage from './pages/my/MyPage.jsx';
import PolicyDetailPage from './pages/common/PolicyDetailPage.jsx';
import PolicyComparePage from './pages/common/PolicyComparePage.jsx';
import NotFoundPage from './pages/common/NotFoundPage.jsx';

export default function App() {
  const pathname = useLocation().pathname;
  const isSearch = pathname === '/search' || pathname === '/search/input';
  const isDetail = /^\/policies\/[^/]+(?:\/compare\/[^/]+)?$/.test(pathname);
  return (
    <div className={`app${isSearch ? ' app--search' : ''}${isDetail ? ' app--detail' : ''}`}>
      <main className="page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/search/input" element={<SearchInputPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/my" element={<MyPage />} />
          <Route path="/policies/:policyId" element={<PolicyDetailPage />} />
          <Route path="/policies/:policyId/compare/:comparisonId" element={<PolicyComparePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      {!isSearch && <AssistantButton />}
      <AssistantSheet />
      <Toast />
      <TabBar />
    </div>
  );
}
