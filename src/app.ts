import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

const app = express();

// CORS configuration
const allowedOrigins = [
  config.frontendUrl,
  'http://localhost:8080',
  'http://localhost:5173',
  'https://socios-funds.vercel.app',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, true); // Allow all in production for now
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Handle preflight requests
app.options('*', cors());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Trust proxy (for getting real IP)
app.set('trust proxy', 1);

// API routes
app.use('/api', routes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Socios Funds API',
    version: '1.0.0',
    status: 'running',
    documentation: '/api/health',
  });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const PORT = config.port;

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🚀 Socios Funds Backend Server                               ║
║                                                                ║
║   Server running on: http://localhost:${PORT}                    ║
║   Environment: ${config.nodeEnv}                                  ║
║   API Base URL: http://localhost:${PORT}/api                     ║
║                                                                ║
║   Available endpoints:                                         ║
║   • POST   /api/auth/login                                     ║
║   • GET    /api/auth/me                                        ║
║   • GET    /api/cooperatives                                   ║
║   • GET    /api/dashboard/kpis                                 ║
║   • GET    /api/balance-sheet                                  ║
║   • GET    /api/cash-flow                                      ║
║   • GET    /api/membership-fees                                ║
║   • GET    /api/ratios                                         ║
║   • POST   /api/upload/balance-sheet                           ║
║   • GET    /api/users                                          ║
║   • POST   /api/notifications/send                             ║
║   • GET    /api/settings                                       ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
  `);
});

export default app;
