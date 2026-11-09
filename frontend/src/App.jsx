import { Routes, Route } from 'react-router-dom';
import TabBar from './components/TabBar.jsx';
import AssistantButton from './components/AssistantButton.jsx';
import HomePage from './pages/home/HomePage.jsx';
import SearchPage from './pages/search/SearchPage.jsx';
import MapPage from './pages/map/MapPage.jsx';
import CalendarPage from './pages/calendar/CalendarPage.jsx';
import MyPage from './pages/my/MyPage.jsx';
import PolicyDetailPage from './pages/common/PolicyDetailPage.jsx';
import NotFoundPage from './pages/common/NotFoundPage.jsx';

export default function App() {
  return (
    <div className="app">
      <main className="page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/my" element={<MyPage />} />
          <Route path="/policies/:policyId" element={<PolicyDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <AssistantButton />
      <TabBar />
    </div>
  );
}
