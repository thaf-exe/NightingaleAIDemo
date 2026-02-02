/**
 * Chat Routes
 * 
 * API endpoints for the chat feature:
 * - POST /api/chat/message - Send a message and get AI response
 * - GET /api/chat/conversations - Get user's conversations
 * - GET /api/chat/conversations/:id - Get specific conversation with messages
 * - POST /api/chat/conversations/:id/close - Close a conversation
 * - GET /api/chat/memory - Get patient's health profile (Living Memory)
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import * as chatModel from '../models/chat.model';
import * as groqService from '../services/groq.service';
import * as userModel from '../models/user.model';
import * as escalationModel from '../models/escalation.model';
import { createAuditLog } from '../models/audit.model';
import type { AuthenticatedRequest } from '../types';
import type { ChatContext } from '../types/chat.types';

const router = Router();

/**
 * POST /api/chat/message
 * 
 * Send a message and get AI response
 * This is the main chat endpoint
 */
router.post('/message', requireAuth, requireRole(['patient']), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;
    const { content, conversation_id } = req.body;

    // Validate input
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Message content is required',
        },
      });
      return;
    }

    if (content.length > 5000) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MESSAGE_TOO_LONG',
          message: 'Message cannot exceed 5000 characters',
        },
      });
      return;
    }

    // Get or create conversation
    let conversation;
    if (conversation_id) {
      conversation = await chatModel.getConversationById(conversation_id);
      if (!conversation || conversation.patient_id !== userId) {
        res.status(404).json({
          success: false,
          error: {
            code: 'CONVERSATION_NOT_FOUND',
            message: 'Conversation not found',
          },
        });
        return;
      }
      // Check if conversation is closed or needs clinician response first
      if (conversation.status !== 'active' && conversation.status !== 'escalated') {
        res.status(400).json({
          success: false,
          error: {
            code: 'CONVERSATION_CLOSED',
            message: 'This conversation is no longer active',
          },
        });
        return;
      }
      
      // If escalated, check if clinician has replied before allowing patient to send
      if (conversation.status === 'escalated') {
        const clinicianReplies = await escalationModel.getClinicianReplies(conversation_id);
        if (clinicianReplies.length === 0) {
          res.status(400).json({
            success: false,
            error: {
              code: 'AWAITING_CLINICIAN',
              message: 'Please wait for a clinician to respond before sending more messages',
            },
          });
          return;
        }
      }
    } else {
      // Try to get active conversation or create new one
      conversation = await chatModel.getActiveConversation(userId);
      if (!conversation) {
        conversation = await chatModel.createConversation(userId);
      }
    }

    // Get user info for context
    const user = await userModel.findUserById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    // Build chat context
    const patientMemory = await chatModel.getPatientMemory(userId);
    const recentMessages = await chatModel.getRecentMessages(conversation.id, 10);
    
    const context: ChatContext = {
      conversation_id: conversation.id,
      patient_name: `${user.first_name} ${user.last_name}`,
      patient_memory: patientMemory,
      recent_messages: recentMessages,
    };

    // Generate AI response first so we can include risk assessment with patient message
    const aiResponse = await groqService.generateResponse(content.trim(), context);

    // Save patient message (with risk assessment if present)
    const patientMessage = await chatModel.createMessage(
      conversation.id,
      'patient',
      userId,
      content.trim(),
      aiResponse.risk_assessment ? {
        riskLevel: aiResponse.risk_assessment.level,
        riskReason: aiResponse.risk_assessment.reason,
        riskConfidence: aiResponse.risk_assessment.confidence,
      } : undefined
    );

    // Save AI response
    const aiMessage = await chatModel.createMessage(
      conversation.id,
      'ai',
      null,
      aiResponse.content,
      {
        aiConfidence: aiResponse.confidence,
      }
    );

    // Extract and save facts to Living Memory
    if (aiResponse.extracted_facts && aiResponse.extracted_facts.length > 0) {
      await chatModel.addToPatientMemory(
        userId,
        aiResponse.extracted_facts,
        patientMessage.id
      );
    }

    // Check if escalation needed
    let escalationWarning = null;
    if (aiResponse.risk_assessment?.should_escalate) {
      await chatModel.updateConversationStatus(conversation.id, 'escalated');
      escalationWarning = {
        level: aiResponse.risk_assessment.level,
        message: 'Based on what you\'ve shared, I recommend speaking with a healthcare provider soon. Would you like me to notify the clinic staff?',
      };
    }

    // Audit log (PHI-free)
    await createAuditLog({
      event_type: 'resource.create',
      user_id: userId,
      ip_address: req.ip || 'unknown',
      user_agent: req.get('User-Agent') || 'unknown',
      resource_type: 'conversation',
      resource_id: conversation.id,
      action_result: 'success',
      metadata: {
        risk_level: aiResponse.risk_assessment?.level || 'not_assessed',
        facts_extracted: aiResponse.extracted_facts?.length || 0,
      },
    });

    res.json({
      success: true,
      data: {
        conversation_id: conversation.id,
        patient_message: {
          id: patientMessage.id,
          content: patientMessage.content,
          created_at: patientMessage.created_at,
        },
        ai_message: {
          id: aiMessage.id,
          content: aiMessage.content,
          confidence: aiResponse.confidence,
          created_at: aiMessage.created_at,
        },
        risk_assessment: aiResponse.risk_assessment,
        escalation_warning: escalationWarning,
      },
    });
  } catch (error) {
    console.error('Chat message error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CHAT_ERROR',
        message: 'Failed to process message',
      },
    });
  }
});

/**
 * GET /api/chat/conversations/active
 * 
 * Get the active conversation for the current user with messages
 */
router.get('/conversations/active', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;
    
    const conversation = await chatModel.getActiveConversation(userId);
    
    if (!conversation) {
      res.json({
        success: true,
        data: null,
      });
      return;
    }
    
    const messages = await chatModel.getConversationMessages(conversation.id);
    
    res.json({
      success: true,
      data: {
        conversation,
        messages,
      },
    });
  } catch (error) {
    console.error('Get active conversation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch active conversation',
      },
    });
  }
});

/**
 * GET /api/chat/conversations
 * 
 * Get all conversations for the current user
 */
router.get('/conversations', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;
    
    const conversations = await chatModel.getPatientConversations(userId);
    
    res.json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch conversations',
      },
    });
  }
});

/**
 * GET /api/chat/conversations/:id
 * 
 * Get a specific conversation with all messages
 */
router.get('/conversations/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;
    const conversationId = String(req.params.id);
    
    const conversation = await chatModel.getConversationById(conversationId);
    
    if (!conversation || conversation.patient_id !== userId) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        },
      });
      return;
    }
    
    const messages = await chatModel.getConversationMessages(conversationId);
    
    res.json({
      success: true,
      data: {
        conversation,
        messages,
      },
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch conversation',
      },
    });
  }
});

/**
 * POST /api/chat/conversations/:id/close
 * 
 * Close a conversation
 */
router.post('/conversations/:id/close', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;
    const conversationId = String(req.params.id);
    
    const conversation = await chatModel.getConversationById(conversationId);
    
    if (!conversation || conversation.patient_id !== userId) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        },
      });
      return;
    }
    
    const updated = await chatModel.updateConversationStatus(conversationId, 'closed');
    
    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Close conversation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to close conversation',
      },
    });
  }
});

/**
 * DELETE /api/chat/conversations/:id
 * 
 * Delete a conversation and all its messages
 */
router.delete('/conversations/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;
    const conversationId = String(req.params.id);
    
    // Verify ownership
    const conversation = await chatModel.getConversationById(conversationId);
    
    if (!conversation || conversation.patient_id !== userId) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        },
      });
      return;
    }
    
    // Prevent deletion of escalated conversations
    if (conversation.status === 'escalated') {
      res.status(403).json({
        success: false,
        error: {
          code: 'ESCALATED_CONVERSATION',
          message: 'Escalated conversations cannot be deleted. They will be reviewed by a clinician and closed.',
        },
      });
      return;
    }
    
    await chatModel.deleteConversation(conversationId);
    
    // Audit log
    await createAuditLog({
      event_type: 'resource.delete',
      user_id: userId,
      resource_type: 'conversation',
      resource_id: conversationId,
      action_result: 'success',
      metadata: { status: conversation.status },
    });
    
    res.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete conversation',
      },
    });
  }
});

/**
 * POST /api/chat/conversations/new
 * 
 * Start a new conversation (closes active one if exists)
 */
router.post('/conversations/new', requireAuth, requireRole(['patient']), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;
    
    // Close any active conversations
    const activeConversation = await chatModel.getActiveConversation(userId);
    if (activeConversation) {
      await chatModel.updateConversationStatus(activeConversation.id, 'closed');
    }
    
    // Create new conversation
    const conversation = await chatModel.createConversation(userId);
    
    res.json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    console.error('New conversation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Failed to create conversation',
      },
    });
  }
});

/**
 * GET /api/chat/memory
 * 
 * Get patient's health profile (Living Memory)
 */
router.get('/memory', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;
    
    const memory = await chatModel.getPatientMemory(userId);
    
    // Group by type for easier display
    const grouped = memory.reduce((acc, item) => {
      if (!acc[item.memory_type]) {
        acc[item.memory_type] = [];
      }
      acc[item.memory_type].push(item);
      return acc;
    }, {} as Record<string, typeof memory>);
    
    res.json({
      success: true,
      data: {
        items: memory,
        grouped,
      },
    });
  } catch (error) {
    console.error('Get memory error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch health profile',
      },
    });
  }
});

export default router;
