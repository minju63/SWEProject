import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import policyRoutes from './routes/policy.routes.js';
import meRoutes from './routes/me.routes.js';
import placeRoutes from './routes/place.routes.js';
import housingRoutes from './routes/housing.routes.js';
import workspaceRoutes from './routes/workspace.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import { notFound, errorHandler } from './middlewares/error.js';
import { startJobs } from './jobs/index.js';
import { ok } from './utils/response.js';

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));
app.use(express.json());

app.get('/api/v1/health', (req, res) => ok(res, { status: 'ok' }));

app.use('/api/v1', housingRoutes);
app.use('/api/v1', catalogRoutes);
app.use('/api/v1', placeRoutes);
app.use('/api/v1/me', meRoutes);
app.use('/api/v1/me', workspaceRoutes);
app.use('/api/v1', policyRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API 서버 실행: http://localhost:${PORT}`));
startJobs();
