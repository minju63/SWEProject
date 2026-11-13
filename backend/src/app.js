import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import policyRoutes from './routes/policy.routes.js';
import meRoutes from './routes/me.routes.js';
import placeRoutes from './routes/place.routes.js';
import { notFound, errorHandler } from './middlewares/error.js';
import { ok } from './utils/response.js';

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

app.get('/api/v1/health', (req, res) => ok(res, { status: 'ok' }));

app.use('/api/v1', policyRoutes);
app.use('/api/v1/me', meRoutes);
app.use('/api/v1', placeRoutes); // 지도 장소 (김대환)
// 새 라우터는 여기에 추가 (예: app.use('/api/v1/me/applications', applicationRoutes))

app.use(notFound);
app.use(errorHandler); // 반드시 맨 마지막

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API 서버 실행: http://localhost:${PORT}`));
