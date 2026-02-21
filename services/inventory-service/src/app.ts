import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10kb' }));

app.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive', service: 'inventory-service' });
});

app.get('/health/ready', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ready', service: 'inventory-service' });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'inventory-service',
    version: '1.0.0',
  });
});

export { app };