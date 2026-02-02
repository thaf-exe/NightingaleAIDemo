/**
 * Chat Interface Component
 * 
 * The main chat interface where patients talk to Nightingale AI.
 * Features:
 * - Message display with different styles for user/AI/clinician
 * - Input field with send button
 * - Voice mode for conversational AI (speak and listen)
 * - Loading state while waiting for AI
 * - Scroll to bottom on new messages
 * - Risk level warnings with "Send to Nurse" action
 * - Async polling for clinician replies
 */

import { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Send, AlertTriangle, Loader2, UserRound, Stethoscope, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from '../ui';
import { 
  sendMessage as sendMessageApi, 
  getConversation, 
  getActiveConversation,
  createEscalation,
  pollClinicianReplies,
  getEscalationStatus
} from '../../services/api';
import { useSpeechRecognition, useSpeechSynthesis } from '../../hooks';
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
  const [autoSpeak, setAutoSpeak] = useState(true);
  
  // Voice hooks
  const {
    isListening,
    transcript,
    interimTranscript,
    error: speechError,
    isSupported: speechRecognitionSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();
  
  const {
    isSpeaking,
    isSupported: speechSynthesisSupported,
    speak,
    cancel: cancelSpeech,
  } = useSpeechSynthesis();
  
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

  // Update input value when transcript changes (voice mode)
  useEffect(() => {
    if (voiceModeEnabled && transcript) {
      setInputValue(transcript);
    }
  }, [voiceModeEnabled, transcript]);

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
    
    // Reset transcript if using voice mode
    if (voiceModeEnabled) {
      resetTranscript();
    }

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
            risk_level: response.risk_assessment?.level,
            created_at: response.patient_message.created_at,
          },
          {
            id: response.ai_message.id,
            conversation_id: response.conversation_id,
            sender_type: 'ai' as const,
            sender_id: null,
            content: response.ai_message.content,
            created_at: response.ai_message.created_at,
          },
        ];
      });

      // Speak AI response if voice mode is enabled
      if (voiceModeEnabled && autoSpeak && response.ai_message.content) {
        speak(response.ai_message.content);
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

  // Handle voice input - start/stop listening
  function handleVoiceToggle() {
    if (isListening) {
      stopListening();
      // Auto-send after stopping if there's content
      if (transcript.trim()) {
        setTimeout(() => handleSend(), 100);
      }
    } else {
      cancelSpeech(); // Stop any ongoing speech before listening
      startListening();
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
      
      {/* Speech Recognition Error */}
      {speechError && (
        <div className={styles.error}>
          <p>{speechError}</p>
        </div>
      )}

      {/* Voice Mode Toggle */}
      {speechRecognitionSupported && (
        <div className={styles.voiceModeBar}>
          <button
            className={`${styles.voiceModeToggle} ${voiceModeEnabled ? styles.active : ''}`}
            onClick={() => {
              setVoiceModeEnabled(!voiceModeEnabled);
              if (!voiceModeEnabled) {
                cancelSpeech();
                stopListening();
              }
            }}
          >
            {voiceModeEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>Voice Mode {voiceModeEnabled ? 'ON' : 'OFF'}</span>
          </button>
          {voiceModeEnabled && speechSynthesisSupported && (
            <label className={styles.autoSpeakToggle}>
              <input 
                type="checkbox" 
                checked={autoSpeak} 
                onChange={(e) => setAutoSpeak(e.target.checked)} 
              />
              <span>Auto-speak responses</span>
            </label>
          )}
          {isSpeaking && (
            <button className={styles.stopSpeaking} onClick={cancelSpeech}>
              Stop Speaking
            </button>
          )}
        </div>
      )}

      {/* Voice Input Indicator */}
      {isListening && (
        <div className={styles.listeningIndicator}>
          <div className={styles.listeningPulse} />
          <span>Listening... {interimTranscript && `"${interimTranscript}"`}</span>
        </div>
      )}

      {/* Input Area */}
      {(() => {
        // Determine if input should be disabled
        const isAwaitingClinicianResponse = !!(escalationStatus 
          && escalationStatus.status !== 'resolved' 
          && !hasClinicianReplied);
        const inputDisabled = isLoading || isAwaitingClinicianResponse;
        const placeholder = isAwaitingClinicianResponse 
          ? "Waiting for clinician response..." 
          : voiceModeEnabled 
            ? "Tap mic to speak or type here..."
            : "Type your message here...";
        
        return (
          <div className={`${styles.inputContainer} ${isAwaitingClinicianResponse ? styles.inputDisabled : ''}`}>
            {/* Voice Input Button */}
            {voiceModeEnabled && speechRecognitionSupported && (
              <Button
                onClick={handleVoiceToggle}
                disabled={inputDisabled || isLoading}
                className={`${styles.voiceButton} ${isListening ? styles.listening : ''}`}
                aria-label={isListening ? "Stop listening" : "Start voice input"}
              >
                {isListening ? (
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
