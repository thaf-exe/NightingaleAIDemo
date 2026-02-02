/**
 * Chat Interface Component
 * 
 * The main chat interface where patients talk to Nightingale AI.
 * Features:
 * - Message display with different styles for user/AI/clinician
 * - Input field with send button
 * - Voice mode for conversational AI (Siri-like: speak and it speaks back)
 * - Uses Groq Whisper for speech-to-text and Google TTS for text-to-speech
 * - Loading state while waiting for AI
 * - Scroll to bottom on new messages
 * - Risk level warnings with "Send to Nurse" action
 * - Async polling for clinician replies
 */

import { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Send, AlertTriangle, Loader2, UserRound, Stethoscope, Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { Button } from '../ui';
import { 
  sendMessage as sendMessageApi, 
  getConversation, 
  getActiveConversation,
  createEscalation,
  pollClinicianReplies,
  getEscalationStatus,
  sendVoiceMessage,
  synthesizeSpeech
} from '../../services/api';
import { useAudioRecorder } from '../../hooks';
import type { Message, ChatResponse, RiskLevel, Escalation } from '../../types';
import styles from './ChatInterface.module.css';

interface ChatInterfaceProps {
  conversationId?: string;
  onConversationStart?: (id: string) => void;
  onMessageSent?: () => void;
}

export interface ChatInterfaceHandle {
  scrollToMessage: (messageId: string) => void;
}

export const ChatInterface = forwardRef<ChatInterfaceHandle, ChatInterfaceProps>(
  function ChatInterface({ conversationId, onConversationStart, onMessageSent }, ref) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState(conversationId);
  const [escalationWarning, setEscalationWarning] = useState<{
    level: RiskLevel;
    message: string;
  } | null>(null);
  const [escalationStatus, setEscalationStatus] = useState<Escalation | null>(null);
  const [isEscalating, setIsEscalating] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<string | null>(null);
  const [hasClinicianReplied, setHasClinicianReplied] = useState(false);
  
  // Voice mode state
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  
  // Audio recorder hook (for real API-based voice)
  const {
    isRecording,
    error: recordingError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useAudioRecorder();
  
  // Audio player ref for TTS playback
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Expose scrollToMessage function to parent
  useImperativeHandle(ref, () => ({
    scrollToMessage: (messageId: string) => {
      const messageEl = messageRefs.current.get(messageId);
      if (messageEl) {
        messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight the message briefly
        messageEl.classList.add(styles.highlighted);
        setTimeout(() => messageEl.classList.remove(styles.highlighted), 2000);
      }
    },
  }));

  // Play audio from base64 data or Blob
  const playAudio = useCallback(async (audioData: string | Blob) => {
    try {
      setIsSpeaking(true);
      
      // Create audio element if not exists
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio();
      }
      
      let audioUrl: string;
      
      if (typeof audioData === 'string') {
        // Base64 string - convert to blob
        const audioBlob = new Blob(
          [Uint8Array.from(atob(audioData), c => c.charCodeAt(0))],
          { type: 'audio/mp3' }
        );
        audioUrl = URL.createObjectURL(audioBlob);
      } else {
        // Already a Blob
        audioUrl = URL.createObjectURL(audioData);
      }
      
      audioPlayerRef.current.src = audioUrl;
      audioPlayerRef.current.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      audioPlayerRef.current.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        setVoiceError('Failed to play audio response');
      };
      
      await audioPlayerRef.current.play();
    } catch (err) {
      console.error('Failed to play audio:', err);
      setIsSpeaking(false);
      setVoiceError('Failed to play audio response');
    }
  }, []);

  // Stop audio playback
  const stopSpeaking = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
  }, []);

  // Poll for clinician replies when conversation is escalated
  const pollForReplies = useCallback(async () => {
    if (!currentConversationId || !escalationStatus) return;
    
    try {
      const data = await pollClinicianReplies(currentConversationId, lastPollTime || undefined);
      if (data.has_new && data.replies.length > 0) {
        // Add new clinician replies to messages
        const newMessages = data.replies.map(reply => ({
          id: reply.id,
          conversation_id: currentConversationId,
          sender_type: 'clinician' as const,
          sender_id: null,
          content: reply.content,
          created_at: reply.created_at,
        }));
        
        setMessages(prev => {
          // Avoid duplicates
          const existingIds = new Set(prev.map(m => m.id));
          const uniqueNew = newMessages.filter(m => !existingIds.has(m.id));
          return [...prev, ...uniqueNew];
        });
        
        // Mark that clinician has replied - this re-enables the input
        setHasClinicianReplied(true);
        
        // Update last poll time
        const latestReply = data.replies[data.replies.length - 1];
        setLastPollTime(latestReply.created_at);
      }
    } catch (err) {
      console.error('Failed to poll for replies:', err);
    }
  }, [currentConversationId, escalationStatus, lastPollTime]);

  // Start/stop polling based on escalation status
  useEffect(() => {
    if (escalationStatus && escalationStatus.status !== 'resolved') {
      // Poll every 10 seconds for clinician replies
      pollIntervalRef.current = setInterval(pollForReplies, 10000);
      // Also poll immediately
      pollForReplies();
    }
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [escalationStatus, pollForReplies]);

  // Check escalation status when conversation loads
  useEffect(() => {
    async function checkEscalation() {
      if (!currentConversationId) return;
      try {
        const status = await getEscalationStatus(currentConversationId);
        setEscalationStatus(status);
        
        // If escalated, check if clinician has already replied
        if (status && status.status !== 'resolved') {
          const repliesData = await pollClinicianReplies(currentConversationId);
          if (repliesData.replies.length > 0) {
            setHasClinicianReplied(true);
          }
        }
      } catch (err) {
        console.error('Failed to check escalation status:', err);
      }
    }
    checkEscalation();
  }, [currentConversationId]);

  // Load existing conversation messages OR active conversation on mount
  useEffect(() => {
    async function loadInitialConversation() {
      setIsLoadingHistory(true);
      try {
        if (conversationId) {
          // Load specific conversation if ID provided
          await loadConversation(conversationId);
        } else {
          // Try to load active conversation
          const activeData = await getActiveConversation();
          if (activeData) {
            setMessages(activeData.messages);
            setCurrentConversationId(activeData.conversation.id);
            onConversationStart?.(activeData.conversation.id);
          }
        }
      } catch (err) {
        console.error('Failed to load conversation:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    }
    
    loadInitialConversation();
  }, [conversationId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
    }
  }, [inputValue]);

  async function loadConversation(id: string) {
    try {
      const data = await getConversation(id);
      setMessages(data.messages);
      setCurrentConversationId(id);
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  }

  async function handleSend() {
    const content = inputValue.trim();
    if (!content || isLoading) return;

    setInputValue('');
    setError(null);
    setIsLoading(true);

    // Optimistically add user message
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: currentConversationId || '',
      sender_type: 'patient',
      sender_id: null,
      content,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMessage]);

    try {
      const response: ChatResponse = await sendMessageApi(content, currentConversationId);
      
      // Update conversation ID if this was a new conversation
      if (!currentConversationId && response.conversation_id) {
        setCurrentConversationId(response.conversation_id);
        onConversationStart?.(response.conversation_id);
      }

      // Replace temp message and add AI response
      setMessages(prev => {
        const filtered = prev.filter(m => !m.id.startsWith('temp-'));
        return [
          ...filtered,
          {
            id: response.patient_message.id,
            conversation_id: response.conversation_id,
            sender_type: 'patient' as const,
            sender_id: null,
            content: response.patient_message.content,
            risk_level: response.patient_message.risk_level,
            risk_reason: response.patient_message.risk_reason,
            risk_confidence: response.patient_message.risk_confidence,
            created_at: response.patient_message.created_at,
          },
          {
            id: response.ai_message.id,
            conversation_id: response.conversation_id,
            sender_type: 'ai' as const,
            sender_id: null,
            content: response.ai_message.content,
            ai_citations: response.ai_message.citations,
            created_at: response.ai_message.created_at,
          },
        ];
      });

      // Speak AI response if voice mode is enabled
      if (voiceModeEnabled && response.ai_message.content) {
        try {
          const audioBlob = await synthesizeSpeech(response.ai_message.content);
          playAudio(audioBlob);
        } catch (err) {
          console.error('Failed to synthesize speech:', err);
        }
      }

      // Handle escalation warning
      if (response.escalation_warning) {
        setEscalationWarning(response.escalation_warning);
      }

      // Notify parent that message was sent (triggers health profile refresh)
      onMessageSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Remove temp message on error
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  // Handle voice input - start/stop recording and send to API
  async function handleVoiceToggle() {
    setVoiceError(null);
    
    if (isRecording) {
      // Stop recording and send to API
      const audioBlob = await stopRecording();
      if (!audioBlob) return;
      
      setIsProcessingVoice(true);
      
      try {
        // Send voice message for full voice chat (transcribe → AI → TTS)
        const response = await sendVoiceMessage(audioBlob, currentConversationId);
        
        // Update conversation ID if this was a new conversation
        if (!currentConversationId && response.conversation_id) {
          setCurrentConversationId(response.conversation_id);
          onConversationStart?.(response.conversation_id);
        }
        
        // Add both messages to the chat
        setMessages(prev => [
          ...prev,
          {
            id: response.patient_message.id,
            conversation_id: response.conversation_id,
            sender_type: 'patient' as const,
            sender_id: null,
            content: response.patient_message.content,
            risk_level: response.risk_assessment?.level,
            risk_reason: response.risk_assessment?.reason,
            risk_confidence: response.risk_assessment?.confidence,
            created_at: response.patient_message.created_at,
          },
          {
            id: response.ai_message.id,
            conversation_id: response.conversation_id,
            sender_type: 'ai' as const,
            sender_id: null,
            content: response.ai_message.content,
            ai_citations: response.ai_message.citations,
            created_at: response.ai_message.created_at,
          },
        ]);
        
        // Play AI audio response
        if (response.audio) {
          playAudio(response.audio);
        }
        
        // Handle escalation warning
        if (response.escalation_warning) {
          setEscalationWarning(response.escalation_warning);
        }
        
        // Notify parent that message was sent
        onMessageSent?.();
      } catch (err) {
        console.error('Voice chat error:', err);
        setVoiceError(err instanceof Error ? err.message : 'Failed to process voice message');
      } finally {
        setIsProcessingVoice(false);
      }
    } else {
      // Start recording
      stopSpeaking(); // Stop any ongoing playback before recording
      await startRecording();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleEscalate() {
    if (!currentConversationId || isEscalating) return;
    
    setIsEscalating(true);
    try {
      const result = await createEscalation(currentConversationId);
      setEscalationStatus({
        id: result.escalation_id,
        status: result.status as Escalation['status'],
        priority: result.priority as Escalation['priority'],
        created_at: new Date().toISOString(),
      });
      setEscalationWarning(null);
      
      // Add a system message indicating escalation
      setMessages(prev => [...prev, {
        id: `system-${Date.now()}`,
        conversation_id: currentConversationId,
        sender_type: 'ai' as const,
        sender_id: null,
        content: '✓ Your message has been sent to the clinic. A healthcare provider will review your case and respond soon. You\'ll see their reply here when it\'s ready.',
        created_at: new Date().toISOString(),
      }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send to clinic');
    } finally {
      setIsEscalating(false);
    }
  }

  function getRiskColor(level?: RiskLevel): string {
    switch (level) {
      case 'high': return styles.riskHigh;
      case 'medium': return styles.riskMedium;
      default: return '';
    }
  }

  function getCitationTooltip(citation: string): string {
    const lowerCitation = citation.toLowerCase();
    
    if (lowerCitation.includes('health profile') || lowerCitation.includes('your profile')) {
      return 'This information comes from your stored health profile, which includes symptoms, medications, allergies, and conditions you\'ve previously mentioned.';
    }
    
    if (lowerCitation.includes('previous message') || lowerCitation.includes('earlier') || lowerCitation.includes('before')) {
      return 'This references something you mentioned earlier in this conversation. The AI is connecting information from your previous messages.';
    }
    
    if (lowerCitation.includes('clinician') || lowerCitation.includes('doctor')) {
      return 'This refers to guidance or instructions provided by your healthcare provider, which takes priority over general suggestions.';
    }
    
    if (lowerCitation.includes('conversation') || lowerCitation.includes('chat')) {
      return 'This is based on the context of your ongoing conversation and the topics discussed so far.';
    }
    
    // Default tooltip
    return `Source: ${citation}. Hover to see where this information came from. All citations are tracked for accuracy and transparency.`;
  }


  return (
    <div className={styles.container}>
      {/* Messages Area */}
      <div className={styles.messagesContainer}>
        {isLoadingHistory && (
          <div className={styles.loadingHistory}>
            <Loader2 className={styles.spinner} size={24} />
            <span>Loading conversation history...</span>
          </div>
        )}

        {!isLoadingHistory && messages.length === 0 && !isLoading && (
          <div className={styles.welcomeMessage}>
            <h3>Welcome to Nightingale AI</h3>
            <p>
              I'm here to listen and help you articulate your health concerns.
              Feel free to share what's on your mind - I'll ask questions to
              better understand your situation.
            </p>
            <p className={styles.disclaimer}>
              Remember: I provide support, not medical diagnoses. Always consult
              a healthcare provider for medical advice.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            ref={(el) => {
              if (el) messageRefs.current.set(message.id, el);
            }}
            className={`${styles.message} ${
              message.sender_type === 'patient' 
                ? styles.userMessage 
                : message.sender_type === 'clinician'
                ? styles.clinicianMessage
                : styles.aiMessage
            } ${getRiskColor(message.risk_level)}`}
          >
            {message.sender_type === 'clinician' && (
              <div className={styles.clinicianBadge}>
                <Stethoscope size={14} />
                <span>Clinic Staff</span>
              </div>
            )}
            <div className={styles.messageContent}>
              {message.content}
            </div>
            
            {/* Risk Assessment Info (for patient messages) */}
            {message.risk_level && (
              <div className={styles.riskInfo}>
                <span className={styles.riskBadge}>
                  Risk: {message.risk_level.toUpperCase()}
                </span>
                {message.risk_reason && (
                  <span className={styles.riskReason}>{message.risk_reason}</span>
                )}
                {message.risk_confidence && (
                  <span className={styles.riskConfidence}>
                    Confidence: {message.risk_confidence}
                  </span>
                )}
              </div>
            )}
            
            {/* Citations (for AI messages) */}
            {message.ai_citations && message.ai_citations.length > 0 && (
              <div className={styles.citations}>
                <div className={styles.citationsLabel}>Sources:</div>
                {message.ai_citations.map((citation, idx) => {
                  // Generate tooltip text based on citation type
                  const tooltipText = getCitationTooltip(citation);
                  
                  return (
                    <div 
                      key={idx} 
                      className={styles.citation}
                      title={tooltipText}
                      data-tooltip={tooltipText}
                    >
                      [{citation}]
                    </div>
                  );
                })}
              </div>
            )}
            
            <div className={styles.messageTime}>
              {new Date(message.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className={`${styles.message} ${styles.aiMessage}`}>
            <div className={styles.typing}>
              <Loader2 className={styles.spinner} size={16} />
              <span>Nightingale is thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Escalation Warning - Show "Send to Nurse" action */}
      {escalationWarning && !escalationStatus && (
        <div className={`${styles.escalationPrompt} ${styles[`warning${escalationWarning.level}`]}`}>
          <div className={styles.escalationContent}>
            <AlertTriangle size={24} />
            <div className={styles.escalationText}>
              <strong>Your concern may need professional attention</strong>
              <p>{escalationWarning.message}</p>
            </div>
          </div>
          <div className={styles.escalationActions}>
            <Button
              variant="primary"
              onClick={handleEscalate}
              disabled={isEscalating}
              className={styles.escalateButton}
            >
              {isEscalating ? (
                <>
                  <Loader2 className={styles.spinner} size={16} />
                  Sending...
                </>
              ) : (
                <>
                  <UserRound size={16} />
                  Send to Nurse/Clinic
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Escalation Status Banner */}
      {escalationStatus && escalationStatus.status !== 'resolved' && (
        <div className={styles.escalationStatus}>
          <Stethoscope size={18} />
          <span>
            {escalationStatus.status === 'pending' && 'Waiting for clinic response...'}
            {escalationStatus.status === 'viewed' && 'A clinician is reviewing your case...'}
            {escalationStatus.status === 'in_progress' && 'A clinician is working on your case...'}
          </span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      
      {/* Voice/Recording Error */}
      {(voiceError || recordingError) && (
        <div className={styles.error}>
          <p>{voiceError || recordingError}</p>
          <button onClick={() => setVoiceError(null)}>×</button>
        </div>
      )}

      {/* Voice Mode Toggle */}
      <div className={styles.voiceModeBar}>
        <button
          className={`${styles.voiceModeToggle} ${voiceModeEnabled ? styles.active : ''}`}
          onClick={() => {
            const newState = !voiceModeEnabled;
            setVoiceModeEnabled(newState);
            if (!newState) {
              stopSpeaking();
              if (isRecording) cancelRecording();
            }
          }}
        >
          {voiceModeEnabled ? <Phone size={16} /> : <PhoneOff size={16} />}
          <span>Voice Chat {voiceModeEnabled ? 'ON' : 'OFF'}</span>
        </button>
        {isSpeaking && (
          <button className={styles.stopSpeaking} onClick={stopSpeaking}>
            Stop Speaking
          </button>
        )}
      </div>

      {/* Voice Recording/Processing Indicator */}
      {isRecording && (
        <div className={styles.listeningIndicator}>
          <div className={styles.listeningPulse} />
          <span>Recording... Tap mic to send</span>
        </div>
      )}
      
      {isProcessingVoice && (
        <div className={styles.listeningIndicator}>
          <Loader2 className={styles.spinner} size={16} />
          <span>Processing voice...</span>
        </div>
      )}

      {/* Input Area */}
      {(() => {
        // Determine if input should be disabled
        const isAwaitingClinicianResponse = !!(escalationStatus 
          && escalationStatus.status !== 'resolved' 
          && !hasClinicianReplied);
        const inputDisabled = isLoading || isProcessingVoice || isAwaitingClinicianResponse;
        const placeholder = isAwaitingClinicianResponse 
          ? "Waiting for clinician response..." 
          : voiceModeEnabled 
            ? "Tap mic to speak or type here..."
            : "Type your message here...";
        
        return (
          <div className={`${styles.inputContainer} ${isAwaitingClinicianResponse ? styles.inputDisabled : ''}`}>
            {/* Voice Input Button */}
            {voiceModeEnabled && (
              <Button
                onClick={handleVoiceToggle}
                disabled={inputDisabled}
                className={`${styles.voiceButton} ${isRecording ? styles.listening : ''}`}
                aria-label={isRecording ? "Stop recording and send" : "Start voice input"}
              >
                {isRecording ? (
                  <MicOff size={20} />
                ) : (
                  <Mic size={20} />
                )}
              </Button>
            )}
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={styles.input}
              rows={1}
              disabled={inputDisabled}
            />
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || inputDisabled}
              className={styles.sendButton}
              aria-label="Send message"
            >
              {isLoading ? (
                <Loader2 className={styles.spinner} size={20} />
              ) : (
                <Send size={20} />
              )}
            </Button>
          </div>
        );
      })()}
    </div>
  );
});

export default ChatInterface;
