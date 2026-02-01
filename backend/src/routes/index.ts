import { Router } from 'express';
import authRoutes from './auth.routes';

const router = Router();

// Mount route modules
router.use('/auth', authRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    },
  });
});

export default router;
