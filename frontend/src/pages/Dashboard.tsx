/**
 * Dashboard Pages
 * 
 * Patient Dashboard: Full chat interface with Nightingale AI
 * Clinician Dashboard: Triage queue (to be expanded)
 */

import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui';
import { ChatInterface, ConversationList, HealthProfilePanel } from '../components/chat';
import type { ChatInterfaceHandle } from '../components/chat';
import { LogOut, ClipboardList, Plus, Heart, User, PanelRight } from 'lucide-react';
import { startNewConversation } from '../services/api';
import styles from './Dashboard.module.css';

export function PatientDashboard() {
  const { user, logout } = useAuth();
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isStartingNew, setIsStartingNew] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [messageCount, setMessageCount] = useState(0);
  const chatRef = useRef<ChatInterfaceHandle>(null);
  
  function handleScrollToMessage(messageId: string) {
    chatRef.current?.scrollToMessage(messageId);
  }
  
  function handleSelectConversation(id: string) {
    setConversationId(id);
  }
  
  function handleConversationDeleted(id: string) {
    // Clear the selected conversation if it was deleted
    if (conversationId === id) {
      setConversationId(undefined);
    }
  }
  
  function handleMessageSent() {
    // Increment to trigger health profile refresh
    setMessageCount(prev => prev + 1);
  }
  
  async function handleNewConversation() {
    setIsStartingNew(true);
    try {
      const conversation = await startNewConversation();
      setConversationId(conversation.id);
    } catch (error) {
      console.error('Failed to start new conversation:', error);
    } finally {
      setIsStartingNew(false);
    }
  }

  function handleConversationStart(id: string) {
    setConversationId(id);
  }
  
  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Heart className={styles.logo} size={24} />
          <span className={styles.brandName}>Nightingale AI</span>
        </div>
        
        <div className={styles.headerCenter}>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleNewConversation}
            disabled={isStartingNew}
          >
            <Plus size={16} />
            New Chat
          </Button>
        </div>
        
        <div className={styles.headerRight}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            title={isRightPanelOpen ? 'Hide health profile' : 'Show health profile'}
          >
            <PanelRight size={18} />
          </Button>
          <div className={styles.userInfo}>
            <User size={16} />
            <span>{user?.first_name}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut size={16} />
            Sign Out
          </Button>
        </div>
      </header>
      
      {/* Main Content with Sidebar */}
      <div className={styles.mainContent}>
        {/* Left Sidebar */}
        {isSidebarOpen && (
          <aside className={styles.sidebar}>
            <ConversationList
              selectedId={conversationId}
              onSelectConversation={handleSelectConversation}
              onConversationDeleted={handleConversationDeleted}
              isSidebarOpen={isSidebarOpen}
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            />
          </aside>
        )}
        {/* Floating sidebar toggle button when sidebar is closed */}
        {!isSidebarOpen && (
          <button
            className={styles.floatingSidebarToggle}
            onClick={() => setIsSidebarOpen(true)}
            title="Show sidebar"
            aria-label="Show sidebar"
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
          </button>
        )}
        {/* Chat Area */}
        <main className={styles.chatMain}>
          <ChatInterface 
            ref={chatRef}
            conversationId={conversationId}
            onConversationStart={handleConversationStart}
            onMessageSent={handleMessageSent}
          />
        </main>
        {/* Right Panel - Health Profile */}
        {isRightPanelOpen && (
          <aside className={styles.rightPanel}>
            <HealthProfilePanel
              conversationId={conversationId}
              onClose={() => setIsRightPanelOpen(false)}
              refreshTrigger={messageCount}
              onScrollToMessage={handleScrollToMessage}
            />
          </aside>
        )}
        {/* Floating right panel toggle button when panel is closed */}
        {!isRightPanelOpen && (
          <button
            className={styles.floatingRightPanelToggle}
            onClick={() => setIsRightPanelOpen(true)}
            title="Show health profile"
            aria-label="Show health profile"
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>
          </button>
        )}
      </div>
    </div>
  );
}

export function ClinicianDashboard() {
  const { user, logout } = useAuth();
  
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Heart className={styles.logo} size={24} />
          <span className={styles.brandName}>Nightingale AI</span>
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
      
      <main className={styles.main}>
        <div className={styles.card}>
          <ClipboardList size={48} className={styles.icon} />
          <h2>Triage Queue</h2>
          <p>Review and respond to escalated patient cases.</p>
          <Button>View Queue</Button>
        </div>
        
        <div className={styles.info}>
          <h3>Your Profile</h3>
          <ul>
            <li><strong>Name:</strong> Dr. {user?.first_name} {user?.last_name}</li>
            <li><strong>Username:</strong> {user?.username}</li>
            <li><strong>Clinic ID:</strong> {user?.clinic_id || 'Not assigned'}</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
