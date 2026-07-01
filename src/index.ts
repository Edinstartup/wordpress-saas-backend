import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config';

// Route imports
import authRoutes from './routes/auth';
import sitesRoutes from './routes/sites';
import ordersRoutes from './routes/orders';
import productsRoutes from './routes/products';
import customersRoutes from './routes/customers';
import webhookRoutes from './routes/webhook';
import commandRoutes, { commandAckRouter } from './routes/commands';

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sites', sitesRoutes);
app.use('/api/sites/:id/orders', ordersRoutes);
app.use('/api/sites/:id/products', productsRoutes);
app.use('/api/sites/:id/customers', customersRoutes);
app.use('/api/sites/:id/commands', commandRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/commands', commandAckRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: config.nodeEnv === 'development' ? err.message : 'Internal server error',
  });
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`[server] WordPress SaaS API running on port ${PORT}`);
  console.log(`[server] Environment: ${config.nodeEnv}`);
  console.log(`[server] CORS origin: ${config.frontendUrl}`);
  console.log(`[server] Health check: http://localhost:${PORT}/health`);
});

export default app;
