import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import policyRoutes from './routes/policy.routes.js';
import meRoutes from './routes/me.routes.js';
import placeRoutes from './routes/place.routes.js';
import housingRoutes from './routes/housing.routes.js';
import workspaceRoutes from './routes/workspace.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import homeRoutes from './routes/home.routes.js';
import assistantRoutes from './routes/assistant.routes.js';
import calendarRoutes from './routes/calendar.routes.js';
import signupRoutes from './routes/signup.routes.js';
import { notFound, errorHandler } from './middlewares/error.js';
import { startJobs } from './jobs/index.js';
import { ok } from './utils/response.js';
import { requireAuth } from './middlewares/auth.js';

const app = express();

app.use(
  cors({
    // CLIENT_URL 외에도, 개발 중 포트가 바뀌는 경우(5173 사용 중 → 5174 …)를 위해 로컬 주소는 포트와 관계없이 허용한다
    origin: (origin, cb) =>
      cb(
        null,
        !origin ||
          origin === process.env.CLIENT_URL ||
          /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ),
    credentials: true,
  })
);
app.use(express.json());

app.get('/api/v1/health', (req, res) => ok(res, { status: 'ok' }));
app.use('/api/v1/auth', signupRoutes);
// FR-COM-07: all application data APIs require login, including public catalog/map routes.
app.use('/api/v1', requireAuth);

app.use('/api/v1', housingRoutes);
app.use('/api/v1', catalogRoutes);
app.use('/api/v1', placeRoutes);
app.use('/api/v1/me', meRoutes);
app.use('/api/v1/me', workspaceRoutes);
app.use('/api/v1/me', calendarRoutes); // 캘린더·정책별 알림 (백민주)
app.use('/api/v1', homeRoutes); // 홈 (백민주)
app.use('/api/v1/assistant', assistantRoutes); // AI 비서 Dr.부 (백민주)
app.use('/api/v1', policyRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API 서버 실행: http://localhost:${PORT}`));
startJobs();
