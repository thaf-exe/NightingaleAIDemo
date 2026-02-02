import { Router } from 'express';
import authRoutes from './auth.routes';
import chatRoutes from './chat.routes';
import escalationRoutes from './escalation.routes';

const router = Router();

// Mount route modules
router.use('/auth', authRoutes);
router.use('/chat', chatRoutes);
router.use('/escalations', escalationRoutes);

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
