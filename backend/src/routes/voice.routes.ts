/**
 * Voice Routes
 * 
 * API endpoints for conversational AI voice features:
 * - POST /api/voice/transcribe - Transcribe audio to text (Groq Whisper)
 * - POST /api/voice/synthesize - Convert text to speech (Google TTS)
 * - POST /api/voice/chat - Full voice conversation (audio in, audio out)
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { transcribeAudio, synthesizeSpeech } from '../services/voice.service';
import * as chatModel from '../models/chat.model';
import { generateResponse } from '../services/groq.service';
import * as userModel from '../models/user.model';
import type { AuthenticatedRequest } from '../types';
import type { ChatContext } from '../types/chat.types';

const router = Router();

// Configure multer for audio file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `audio-${uniqueSuffix}${path.extname(file.originalname) || '.webm'}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max (Whisper limit)
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'audio/webm',
      'audio/wav',
      'audio/mp3',
      'audio/mpeg',
      'audio/ogg',
      'audio/flac',
      'audio/m4a',
      'audio/mp4',
    ];
    if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio format'));
    }
  }
});

/**
 * POST /api/voice/transcribe
 * 
 * Transcribe audio file to text using Groq Whisper
 */
router.post('/transcribe', requireAuth, upload.single('audio'), async (req: Request, res: Response) => {
  const filePath = req.file?.path;
  
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_AUDIO', message: 'No audio file provided' },
      });
      return;
    }

    const transcript = await transcribeAudio(filePath!);

    res.json({
      success: true,
      data: {
        text: transcript,
      },
    });
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'TRANSCRIPTION_ERROR', message: 'Failed to transcribe audio' },
    });
  } finally {
    // Clean up uploaded file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

/**
 * POST /api/voice/synthesize
 * 
 * Convert text to speech using Google TTS
 * Returns audio file
 */
router.post('/synthesize', requireAuth, async (req: Request, res: Response) => {
  try {
    const { text, language = 'en' } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'NO_TEXT', message: 'Text is required' },
      });
      return;
    }

    const audioBuffer = await synthesizeSpeech(text, language);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
    });
    res.send(audioBuffer);
  } catch (error) {
    console.error('Synthesis error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SYNTHESIS_ERROR', message: 'Failed to synthesize speech' },
    });
  }
});

/**
 * POST /api/voice/chat
 * 
 * Full voice conversation endpoint:
 * 1. Receives audio
 * 2. Transcribes with Whisper
 * 3. Gets AI response
 * 4. Returns both text and audio response
 */
router.post('/chat', requireAuth, requireRole(['patient']), upload.single('audio'), async (req: Request, res: Response) => {
  const filePath = req.file?.path;
  
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;
    const { conversation_id } = req.body;

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_AUDIO', message: 'No audio file provided' },
      });
      return;
    }

    // 1. Transcribe audio
    const transcript = await transcribeAudio(filePath!);
    
    if (!transcript || transcript.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_SPEECH', message: 'No speech detected in audio' },
      });
      return;
    }

    // 2. Get or create conversation
    let conversation;
    if (conversation_id) {
      conversation = await chatModel.getConversationById(conversation_id);
      if (!conversation || conversation.patient_id !== userId) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Conversation not found' },
        });
        return;
      }
    } else {
      conversation = await chatModel.getActiveConversation(userId);
      if (!conversation) {
        conversation = await chatModel.createConversation(userId);
      }
    }

    // 3. Build chat context (same as regular chat)
    const user = await userModel.findUserById(userId);
    const patientMemory = await chatModel.getPatientMemory(userId);
    const recentMessages = await chatModel.getRecentMessages(conversation.id, 10);

    const context: ChatContext = {
      conversation_id: conversation.id,
      patient_name: user ? `${user.first_name} ${user.last_name}` : 'Patient',
      patient_memory: patientMemory,
      recent_messages: recentMessages,
    };

    // 4. Get AI response
    const aiResponse = await generateResponse(transcript, context);

    // 5. Save messages to database
    const patientMessage = await chatModel.createMessage(
      conversation.id,
      'patient',
      userId,
      transcript,
      aiResponse.risk_assessment ? {
        riskLevel: aiResponse.risk_assessment.level,
        riskReason: aiResponse.risk_assessment.reason,
        riskConfidence: aiResponse.risk_assessment.confidence,
      } : undefined
    );

    const aiMessage = await chatModel.createMessage(
      conversation.id,
      'ai',
      null,
      aiResponse.content,
      {
        aiConfidence: aiResponse.confidence,
      }
    );

    // 6. Process extracted facts
    if (aiResponse.extracted_facts && aiResponse.extracted_facts.length > 0) {
      await chatModel.addToPatientMemory(
        userId,
        aiResponse.extracted_facts,
        patientMessage.id
      );
    }

    // 7. Generate audio response
    const audioBuffer = await synthesizeSpeech(aiResponse.content);

    // 8. Check if escalation warning needed
    let escalationWarning = null;
    if (aiResponse.risk_assessment?.should_escalate) {
      await chatModel.updateConversationStatus(conversation.id, 'escalated');
      escalationWarning = {
        level: aiResponse.risk_assessment.level as 'low' | 'medium' | 'high',
        message: 'Based on what you\'ve shared, I recommend speaking with a healthcare provider soon.',
      };
    }

    // 9. Return response with both text and audio
    res.json({
      success: true,
      data: {
        conversation_id: conversation.id,
        transcript: transcript,
        patient_message: {
          id: patientMessage.id,
          content: transcript,
          created_at: patientMessage.created_at,
        },
        ai_message: {
          id: aiMessage.id,
          content: aiResponse.content,
          citations: aiResponse.citations,
          created_at: aiMessage.created_at,
        },
        audio: audioBuffer.toString('base64'),
        risk_assessment: aiResponse.risk_assessment ? {
          level: aiResponse.risk_assessment.level,
          reason: aiResponse.risk_assessment.reason,
          confidence: aiResponse.risk_assessment.confidence,
        } : undefined,
        escalation_warning: escalationWarning,
      },
    });
  } catch (error) {
    console.error('Voice chat error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'VOICE_CHAT_ERROR', message: 'Failed to process voice chat' },
    });
  } finally {
    // Clean up uploaded file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

export default router;
