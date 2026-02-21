import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10kb' }));

// Health check — liveness
app.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive', service: 'order-service' });
});

// Health check — readiness (will add dependency checks later)
app.get('/health/ready', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ready', service: 'order-service' });
});

// Placeholder root
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'order-service',
    version: '1.0.0',
    docs: '/api-docs',
  });
});

export { app };