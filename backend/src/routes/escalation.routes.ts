/**
 * Escalation Routes
 * 
 * API endpoints for the escalation/triage system:
 * 
 * Patient endpoints:
 * - POST /api/escalations - Create an escalation (send to nurse/clinic)
 * - GET /api/escalations/conversation/:id - Get escalation status for a conversation
 * - GET /api/escalations/replies/:conversationId - Poll for clinician replies
 * 
 * Clinician endpoints:
 * - GET /api/escalations/queue - Get triage queue for clinic
 * - GET /api/escalations/:id - Get escalation details
 * - POST /api/escalations/:id/reply - Send reply to patient
 * - PATCH /api/escalations/:id/status - Update escalation status
 * - POST /api/escalations/:id/resolve - Resolve escalation
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import * as escalationModel from '../models/escalation.model';
import * as chatModel from '../models/chat.model';
import * as userModel from '../models/user.model';
import * as groqService from '../services/groq.service';
import { createAuditLog } from '../models/audit.model';
import type { AuthenticatedRequest } from '../types';

const router = Router();

// =============================================
// PATIENT ENDPOINTS
// =============================================

/**
 * POST /api/escalations
 * 
 * Create an escalation - "Send to Nurse/Clinic"
 * Patient triggers this when they want human help
 */
router.post('/', requireAuth, requireRole(['patient']), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;
    const { conversation_id, triggering_message_id } = req.body;

    // Validate input
    if (!conversation_id) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Conversation ID is required' },
      });
      return;
    }

    // Verify conversation belongs to patient
    const conversation = await chatModel.getConversationById(conversation_id);
    if (!conversation || conversation.patient_id !== userId) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    // Check if already escalated
    const existingEscalation = await escalationModel.getEscalationByConversationId(conversation_id);
    if (existingEscalation && existingEscalation.status !== 'resolved') {
      res.status(400).json({
        success: false,
        error: { code: 'ALREADY_ESCALATED', message: 'This conversation is already escalated' },
      });
      return;
    }

    // Get user's clinic
    const user = await userModel.findUserById(userId);
    if (!user || !user.clinic_id) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_CLINIC', message: 'You must be associated with a clinic to escalate' },
      });
      return;
    }

    // Get conversation messages for triage summary
    const messages = await chatModel.getConversationMessages(conversation_id);
    
    // Get patient memory for profile snapshot
    const patientMemory = await chatModel.getPatientMemory(userId);
    
    // Generate triage summary using AI
    const triageSummary = await groqService.generateTriageSummary(messages, patientMemory);
    
    // Build profile snapshot
    const profileSnapshot = {
      patient_name: `${user.first_name} ${user.last_name}`,
      captured_at: new Date().toISOString(),
      memory_items: patientMemory.map(item => ({
        type: item.memory_type,
        value: item.value,
        status: item.status,
        timeline: item.timeline,
      })),
    };

    // Determine priority based on last risk assessment
    const lastPatientMessage = messages.filter(m => m.sender_type === 'patient').pop();
    const priority = lastPatientMessage?.risk_level === 'high' ? 'high' : 'medium';

    // Create escalation
    const escalation = await escalationModel.createEscalation(
      conversation_id,
      userId,
      user.clinic_id,
      triggering_message_id || lastPatientMessage?.id || messages[messages.length - 1]?.id,
      'Patient requested clinic assistance',
      triageSummary,
      profileSnapshot,
      priority
    );

    // Update conversation status
    await chatModel.updateConversationStatus(conversation_id, 'escalated');

    // Audit log
    await createAuditLog({
      event_type: 'escalation.create',
      user_id: userId,
      resource_type: 'escalation',
      resource_id: escalation.id,
      action_result: 'success',
      metadata: { priority, conversation_id },
    });

    res.status(201).json({
      success: true,
      data: {
        escalation_id: escalation.id,
        status: escalation.status,
        priority: escalation.priority,
        message: 'Your message has been sent to the clinic. A healthcare provider will respond soon.',
      },
    });
  } catch (error) {
    console.error('Create escalation error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'ESCALATION_ERROR', message: 'Failed to create escalation' },
    });
  }
});

/**
 * GET /api/escalations/conversation/:id
 * 
 * Get escalation status for a conversation (patient view)
 */
router.get('/conversation/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;
    const conversationId = String(req.params.id);

    // Verify conversation belongs to user
    const conversation = await chatModel.getConversationById(conversationId);
    if (!conversation || conversation.patient_id !== userId) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    const escalation = await escalationModel.getEscalationByConversationId(conversationId);
    
    if (!escalation) {
      res.json({
        success: true,
        data: null,
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: escalation.id,
        status: escalation.status,
        priority: escalation.priority,
        created_at: escalation.created_at,
        resolved_at: escalation.resolved_at,
      },
    });
  } catch (error) {
    console.error('Get escalation status error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch escalation status' },
    });
  }
});

/**
 * GET /api/escalations/replies/:conversationId
 * 
 * Poll for clinician replies (async update for patient)
 * Supports ?since=timestamp for incremental updates
 */
router.get('/replies/:conversationId', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;
    const conversationId = String(req.params.conversationId);
    const since = req.query.since ? new Date(req.query.since as string) : new Date(0);

    // Verify conversation belongs to user
    const conversation = await chatModel.getConversationById(conversationId);
    if (!conversation || conversation.patient_id !== userId) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    // Get all clinician replies (messages with sender_type = 'clinician')
    const messages = await chatModel.getConversationMessages(conversationId);
    const clinicianReplies = messages
      .filter(m => m.sender_type === 'clinician' && new Date(m.created_at) > since)
      .map(m => ({
        id: m.id,
        content: m.content,
        sender_type: 'clinician',
        created_at: m.created_at,
      }));

    res.json({
      success: true,
      data: {
        replies: clinicianReplies,
        has_new: clinicianReplies.length > 0,
      },
    });
  } catch (error) {
    console.error('Poll replies error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch replies' },
    });
  }
});

// =============================================
// CLINICIAN ENDPOINTS
// =============================================

/**
 * GET /api/escalations/queue
 * 
 * Get triage queue for clinician's clinic
 */
router.get('/queue', requireAuth, requireRole(['clinician']), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const clinicianId = authReq.user!.id;

    // Get clinician's clinic
    const clinician = await userModel.findUserById(clinicianId);
    if (!clinician || !clinician.clinic_id) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_CLINIC', message: 'Clinician must be associated with a clinic' },
      });
      return;
    }

    const queue = await escalationModel.getClinicTriageQueue(clinician.clinic_id);

    res.json({
      success: true,
      data: queue.map(e => ({
        id: e.id,
        patient_name: e.patient_name,
        priority: e.priority,
        status: e.status,
        triage_summary: e.triage_summary,
        created_at: e.created_at,
        assigned_to_me: e.assigned_clinician_id === clinicianId,
      })),
    });
  } catch (error) {
    console.error('Get triage queue error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch triage queue' },
    });
  }
});

/**
 * GET /api/escalations/:id
 * 
 * Get full escalation details (clinician view)
 */
router.get('/:id', requireAuth, requireRole(['clinician']), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const clinicianId = authReq.user!.id;
    const escalationId = String(req.params.id);

    // Get clinician's clinic
    const clinician = await userModel.findUserById(clinicianId);
    if (!clinician || !clinician.clinic_id) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_CLINIC', message: 'Clinician must be associated with a clinic' },
      });
      return;
    }

    const escalation = await escalationModel.getEscalationDetails(escalationId, clinician.clinic_id);
    
    if (!escalation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Escalation not found' },
      });
      return;
    }

    // Get conversation messages for context
    const messages = await chatModel.getConversationMessages(escalation.conversation_id);

    // Mark as viewed if pending
    if (escalation.status === 'pending') {
      await escalationModel.updateEscalationStatus(escalationId, 'viewed');
    }

    res.json({
      success: true,
      data: {
        escalation: {
          id: escalation.id,
          patient_name: escalation.patient_name,
          patient_email: escalation.patient_email,
          priority: escalation.priority,
          status: escalation.status,
          trigger_reason: escalation.trigger_reason,
          triggering_message: escalation.triggering_message_content,
          triage_summary: escalation.triage_summary,
          profile_snapshot: escalation.profile_snapshot,
          created_at: escalation.created_at,
        },
        conversation_history: messages.map(m => ({
          id: m.id,
          sender_type: m.sender_type,
          content: m.content,
          created_at: m.created_at,
          risk_level: m.risk_level,
        })),
      },
    });
  } catch (error) {
    console.error('Get escalation details error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch escalation details' },
    });
  }
});

/**
 * POST /api/escalations/:id/reply
 * 
 * Send clinician reply to patient
 * This creates a message that appears in patient's chat
 */
router.post('/:id/reply', requireAuth, requireRole(['clinician']), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const clinicianId = authReq.user!.id;
    const escalationId = String(req.params.id);
    const { content } = req.body;

    // Validate input
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Reply content is required' },
      });
      return;
    }

    // Get clinician's clinic
    const clinician = await userModel.findUserById(clinicianId);
    if (!clinician || !clinician.clinic_id) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_CLINIC', message: 'Clinician must be associated with a clinic' },
      });
      return;
    }

    // Get escalation and verify it belongs to clinician's clinic
    const escalation = await escalationModel.getEscalationDetails(escalationId, clinician.clinic_id);
    if (!escalation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Escalation not found' },
      });
      return;
    }

    // Add clinician reply as a message
    const result = await escalationModel.addClinicianReply(
      escalation.conversation_id,
      clinicianId,
      content.trim(),
      escalationId
    );

    // Also add this as "clinician guidance" to patient memory for AI context
    // This becomes ground truth that can override prior AI assumptions
    await chatModel.addToPatientMemory(
      escalation.patient_id,
      [{
        type: 'clinician_guidance',
        value: content.trim(),
        action: 'add',
      }],
      result.messageId
    );

    // Audit log
    await createAuditLog({
      event_type: 'escalation.reply',
      user_id: clinicianId,
      resource_type: 'escalation',
      resource_id: escalationId,
      action_result: 'success',
      metadata: { conversation_id: escalation.conversation_id },
    });

    res.json({
      success: true,
      data: {
        message_id: result.messageId,
        sent_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Clinician reply error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'REPLY_ERROR', message: 'Failed to send reply' },
    });
  }
});

/**
 * PATCH /api/escalations/:id/status
 * 
 * Update escalation status
 */
router.patch('/:id/status', requireAuth, requireRole(['clinician']), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const clinicianId = authReq.user!.id;
    const escalationId = String(req.params.id);
    const { status } = req.body;

    const validStatuses = ['viewed', 'in_progress', 'resolved'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: `Status must be one of: ${validStatuses.join(', ')}` },
      });
      return;
    }

    // Get clinician's clinic
    const clinician = await userModel.findUserById(clinicianId);
    if (!clinician || !clinician.clinic_id) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_CLINIC', message: 'Clinician must be associated with a clinic' },
      });
      return;
    }

    // Verify escalation belongs to clinic
    const escalation = await escalationModel.getEscalationDetails(escalationId, clinician.clinic_id);
    if (!escalation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Escalation not found' },
      });
      return;
    }

    const updated = await escalationModel.updateEscalationStatus(escalationId, status);

    // Audit log
    await createAuditLog({
      event_type: 'escalation.status_change',
      user_id: clinicianId,
      resource_type: 'escalation',
      resource_id: escalationId,
      action_result: 'success',
      metadata: { old_status: escalation.status, new_status: status },
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'UPDATE_ERROR', message: 'Failed to update status' },
    });
  }
});

/**
 * POST /api/escalations/:id/resolve
 * 
 * Resolve an escalation with notes
 */
router.post('/:id/resolve', requireAuth, requireRole(['clinician']), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const clinicianId = authReq.user!.id;
    const escalationId = String(req.params.id);
    const { resolution_notes } = req.body;

    // Get clinician's clinic
    const clinician = await userModel.findUserById(clinicianId);
    if (!clinician || !clinician.clinic_id) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_CLINIC', message: 'Clinician must be associated with a clinic' },
      });
      return;
    }

    // Verify escalation belongs to clinic
    const escalation = await escalationModel.getEscalationDetails(escalationId, clinician.clinic_id);
    if (!escalation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Escalation not found' },
      });
      return;
    }

    const updated = await escalationModel.updateEscalationStatus(
      escalationId,
      'resolved',
      resolution_notes
    );

    // Update conversation status to closed
    await chatModel.updateConversationStatus(escalation.conversation_id, 'closed');

    // Audit log
    await createAuditLog({
      event_type: 'escalation.resolve',
      user_id: clinicianId,
      resource_type: 'escalation',
      resource_id: escalationId,
      action_result: 'success',
      metadata: { patient_id: escalation.patient_id },
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Resolve escalation error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'RESOLVE_ERROR', message: 'Failed to resolve escalation' },
    });
  }
});

export default router;
