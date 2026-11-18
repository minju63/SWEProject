import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import policyRoutes from './routes/policy.routes.js';
import meRoutes from './routes/me.routes.js';
import housingRoutes from './routes/housing.routes.js';
import workspaceRoutes from './routes/workspace.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import { notFound, errorHandler } from './middlewares/error.js';
import { ok } from './utils/response.js';

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

app.get('/api/v1/health', (req, res) => ok(res, { status: 'ok' }));

app.use('/api/v1', policyRoutes);
app.use('/api/v1', housingRoutes);
app.use('/api/v1', catalogRoutes);
app.use('/api/v1/me', meRoutes);
app.use('/api/v1/me', workspaceRoutes);
// 새 라우터는 여기에 추가 (예: app.use('/api/v1/me/applications', applicationRoutes))

app.use(notFound);
app.use(errorHandler); // 반드시 맨 마지막

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API 서버 실행: http://localhost:${PORT}`));
