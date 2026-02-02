/**
 * Triage Queue Page
 * 
 * Clinician view for managing escalated patient cases.
 * Features:
 * - List of pending escalations sorted by priority
 * - Click to view details and conversation history
 * - Reply to patients directly
 * - Resolve cases with notes
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui';
import { 
  LogOut, Heart, User, AlertTriangle, Clock, 
  ChevronRight, Send, Loader2, CheckCircle,
  MessageSquare, FileText, Activity
} from 'lucide-react';
import { 
  getTriageQueue, 
  getEscalationDetails, 
  sendClinicianReply,
  resolveEscalation 
} from '../services/api';
import type { TriageQueueItem, EscalationDetails } from '../types';
import styles from './TriageQueue.module.css';

export function TriageQueuePage() {
  const { user, logout } = useAuth();
  const [queue, setQueue] = useState<TriageQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<EscalationDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  // Load queue on mount
  useEffect(() => {
    loadQueue();
    // Refresh queue every 30 seconds
    const interval = setInterval(loadQueue, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadQueue() {
    try {
      const data = await getTriageQueue();
      setQueue(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSelectCase(id: string) {
    if (selectedId === id) {
      setSelectedId(null);
      setSelectedDetails(null);
      return;
    }
    
    setSelectedId(id);
    setIsLoadingDetails(true);
    
    try {
      const details = await getEscalationDetails(id);
      setSelectedDetails(details);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load case details');
    } finally {
      setIsLoadingDetails(false);
    }
  }

  async function handleSendReply() {
    if (!selectedId || !replyContent.trim() || isSending) return;
    
    setIsSending(true);
    try {
      await sendClinicianReply(selectedId, replyContent.trim());
      setReplyContent('');
      // Refresh details to show the new message
      const details = await getEscalationDetails(selectedId);
      setSelectedDetails(details);
      // Refresh queue to update status
      loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setIsSending(false);
    }
  }

  async function handleResolve() {
    if (!selectedId || isResolving) return;
    
    setIsResolving(true);
    try {
      await resolveEscalation(selectedId, 'Case resolved via triage queue');
      setSelectedId(null);
      setSelectedDetails(null);
      loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve case');
    } finally {
      setIsResolving(false);
    }
  }

  function getPriorityColor(priority: string): string {
    switch (priority) {
      case 'urgent': return styles.priorityUrgent;
      case 'high': return styles.priorityHigh;
      case 'medium': return styles.priorityMedium;
      default: return styles.priorityLow;
    }
  }

  function formatTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Heart className={styles.logo} size={24} />
          <span className={styles.brandName}>Nightingale AI</span>
          <span className={styles.headerDivider}>|</span>
          <span className={styles.pageTitle}>Triage Queue</span>
        </div>
        
        <div className={styles.headerRight}>
          <div className={styles.userInfo}>
            <User size={16} />
            <span>Dr. {user?.first_name}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut size={16} />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Queue List */}
        <aside className={styles.queueList}>
          <div className={styles.queueHeader}>
            <h2>Pending Cases</h2>
            <span className={styles.queueCount}>{queue.length}</span>
          </div>

          {isLoading && (
            <div className={styles.loading}>
              <Loader2 className={styles.spinner} size={24} />
              <span>Loading queue...</span>
            </div>
          )}

          {!isLoading && queue.length === 0 && (
            <div className={styles.emptyQueue}>
              <CheckCircle size={48} />
              <p>No pending cases</p>
              <span>All caught up!</span>
            </div>
          )}

          {queue.map(item => (
            <div
              key={item.id}
              className={`${styles.queueItem} ${selectedId === item.id ? styles.selected : ''}`}
              onClick={() => handleSelectCase(item.id)}
            >
              <div className={styles.queueItemHeader}>
                <span className={`${styles.priority} ${getPriorityColor(item.priority)}`}>
                  {item.priority.toUpperCase()}
                </span>
                <span className={styles.timeAgo}>
                  <Clock size={12} />
                  {formatTimeAgo(item.created_at)}
                </span>
              </div>
              <div className={styles.patientName}>{item.patient_name}</div>
              <ul className={styles.summaryPreview}>
                {item.triage_summary.slice(0, 2).map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
              <ChevronRight className={styles.chevron} size={16} />
            </div>
          ))}
        </aside>

        {/* Case Details Panel */}
        <main className={styles.detailsPanel}>
          {!selectedId && (
            <div className={styles.noSelection}>
              <MessageSquare size={48} />
              <p>Select a case to view details</p>
            </div>
          )}

          {isLoadingDetails && (
            <div className={styles.loading}>
              <Loader2 className={styles.spinner} size={24} />
              <span>Loading case details...</span>
            </div>
          )}

          {selectedDetails && !isLoadingDetails && (
            <>
              {/* Patient Info Header */}
              <div className={styles.caseHeader}>
                <div className={styles.patientInfo}>
                  <h2>{selectedDetails.escalation.patient_name}</h2>
                  <span className={styles.patientEmail}>{selectedDetails.escalation.patient_email}</span>
                </div>
                <div className={styles.caseActions}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResolve}
                    disabled={isResolving}
                  >
                    {isResolving ? (
                      <Loader2 className={styles.spinner} size={16} />
                    ) : (
                      <CheckCircle size={16} />
                    )}
                    Mark Resolved
                  </Button>
                </div>
              </div>

              {/* Triage Summary */}
              <div className={styles.section}>
                <h3>
                  <FileText size={18} />
                  Triage Summary
                </h3>
                <ul className={styles.triageSummary}>
                  {selectedDetails.escalation.triage_summary.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>

              {/* Health Profile Snapshot */}
              {selectedDetails.escalation.profile_snapshot.memory_items.length > 0 && (
                <div className={styles.section}>
                  <h3>
                    <Activity size={18} />
                    Health Profile
                  </h3>
                  <div className={styles.profileSnapshot}>
                    {selectedDetails.escalation.profile_snapshot.memory_items.map((item, i) => (
                      <div key={i} className={styles.profileItem}>
                        <span className={styles.profileType}>{item.type}</span>
                        <span className={styles.profileValue}>
                          {item.value}
                          {item.status && item.status !== 'active' && (
                            <span className={styles.profileStatus}>({item.status})</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conversation History */}
              <div className={styles.section}>
                <h3>
                  <MessageSquare size={18} />
                  Conversation History
                </h3>
                <div className={styles.conversationHistory}>
                  {selectedDetails.conversation_history.map(msg => (
                    <div
                      key={msg.id}
                      className={`${styles.historyMessage} ${styles[`sender${msg.sender_type}`]}`}
                    >
                      <div className={styles.messageSender}>
                        {msg.sender_type === 'patient' && 'Patient'}
                        {msg.sender_type === 'ai' && 'Nightingale AI'}
                        {msg.sender_type === 'clinician' && 'Clinician'}
                      </div>
                      <div className={styles.messageText}>{msg.content}</div>
                      <div className={styles.messageTime}>
                        {new Date(msg.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reply Input */}
              <div className={styles.replySection}>
                <h3>Send Reply to Patient</h3>
                <div className={styles.replyInput}>
                  <textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Type your response to the patient..."
                    rows={3}
                    disabled={isSending}
                  />
                  <Button
                    variant="primary"
                    onClick={handleSendReply}
                    disabled={!replyContent.trim() || isSending}
                  >
                    {isSending ? (
                      <Loader2 className={styles.spinner} size={16} />
                    ) : (
                      <Send size={16} />
                    )}
                    Send Reply
                  </Button>
                </div>
                <p className={styles.replyNote}>
                  Your reply will appear in the patient's chat with a "Clinic Staff" badge.
                </p>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Error Toast */}
      {error && (
        <div className={styles.errorToast}>
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
    </div>
  );
}

export default TriageQueuePage;
