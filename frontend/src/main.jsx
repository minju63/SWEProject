import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './index.css';
import { AuthProvider } from './lib/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './styles/index.css';
import './styles/assistant.css';
import { watchTouchTargets } from './lib/touchTargets';
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

watchTouchTargets(); // 작은 아이콘 버튼의 터치 영역을 44px로 넓힘 (NFR-COM-011)
