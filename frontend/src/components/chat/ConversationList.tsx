/**
 * Conversation List Component
 * 
 * Displays a list of previous conversations in a sidebar.
 * Users can click on a conversation to load its messages.
 */

import { useState, useEffect } from 'react';
import { MessageCircle, Clock, Loader2, Trash2, X, AlertTriangle, PanelLeftClose, PanelLeft } from 'lucide-react';
import { getConversations, deleteConversation } from '../../services/api';
import { Button } from '../ui';
import type { Conversation } from '../../types';
import styles from './ConversationList.module.css';

interface ConversationListProps {
  selectedId?: string;
  onSelectConversation: (id: string) => void;
  onConversationDeleted?: (id: string) => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function ConversationList({ selectedId, onSelectConversation, onConversationDeleted, isSidebarOpen, onToggleSidebar }: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  // Refresh conversations when selectedId changes (new conversation created)
  useEffect(() => {
    if (selectedId) {
      loadConversations();
    }
  }, [selectedId]);

  async function loadConversations() {
    try {
      setIsLoading(true);
      const data = await getConversations();
      setConversations(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load conversations:', err);
      setError('Failed to load conversations');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteConversation(deleteTarget.id);
      setConversations(prev => prev.filter(c => c.id !== deleteTarget.id));
      
      // Notify parent if the deleted conversation was selected
      if (selectedId === deleteTarget.id) {
        onConversationDeleted?.(deleteTarget.id);
      }
      
      setDeleteTarget(null);
    } catch (err: any) {
      console.error('Failed to delete conversation:', err);
      // Show the error message from the server if available
      const errorMessage = err?.message || 'Failed to delete conversation';
      setDeleteError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  }

  function handleDeleteClick(e: React.MouseEvent, conversation: Conversation) {
    e.stopPropagation(); // Prevent selecting the conversation
    setDeleteTarget(conversation);
    setDeleteError(null); // Clear any previous error
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'active': return 'Active';
      case 'escalated': return 'Escalated';
      case 'closed': return 'Closed';
      default: return status;
    }
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3>Conversations</h3>
        </div>
        <div className={styles.loading}>
          <Loader2 className={styles.spinner} size={20} />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3>Conversations</h3>
        </div>
        <div className={styles.error}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>Conversations</h3>
        <span className={styles.count}>{conversations.length}</span>
        {typeof isSidebarOpen === 'boolean' && onToggleSidebar && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSidebar}
            title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            className={styles.sidebarToggleBtn}
          >
            {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </Button>
        )}
      </div>
      
      <div className={styles.list}>
        {conversations.length === 0 ? (
          <div className={styles.empty}>
            <MessageCircle size={32} />
            <p>No conversations yet</p>
            <span>Start a new chat to begin</span>
          </div>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`${styles.item} ${selectedId === conversation.id ? styles.selected : ''}`}
            >
              <button
                className={styles.itemButton}
                onClick={() => onSelectConversation(conversation.id)}
              >
                <div className={styles.itemIcon}>
                  <MessageCircle size={18} />
                </div>
                <div className={styles.itemContent}>
                  <div className={styles.itemHeader}>
                    <span className={styles.itemTitle}>
                      Chat {formatDate(conversation.created_at)}
                    </span>
                    <span className={`${styles.status} ${styles[conversation.status]}`}>
                      {getStatusLabel(conversation.status)}
                    </span>
                  </div>
                  <div className={styles.itemMeta}>
                    <Clock size={12} />
                    <span>{new Date(conversation.updated_at).toLocaleString()}</span>
                  </div>
                </div>
              </button>
              <button
                className={styles.deleteButton}
                onClick={(e) => handleDeleteClick(e, conversation)}
                title="Delete conversation"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className={styles.modalOverlay} onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>
              <X size={18} />
            </button>
            <div className={deleteError ? styles.modalIconError : styles.modalIcon}>
              <AlertTriangle size={32} />
            </div>
            <h3>{deleteError ? 'Cannot Delete' : 'Delete Conversation?'}</h3>
            {deleteError ? (
              <p className={styles.errorMessage}>{deleteError}</p>
            ) : (
              <p>
                This will permanently delete this conversation and all its messages.
                This action cannot be undone.
              </p>
            )}
            <div className={styles.modalActions}>
              <Button
                variant="outline"
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                disabled={isDeleting}
              >
                {deleteError ? 'Close' : 'Cancel'}
              </Button>
              {!deleteError && (
                <Button
                  variant="primary"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className={styles.deleteConfirmButton}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className={styles.spinner} size={16} />
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConversationList;
