/**
 * Dashboard Pages
 * 
 * These will be expanded later. For now, simple placeholders
 * that show the user is logged in.
 */


import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui';
import { LogOut, MessageCircle, ClipboardList } from 'lucide-react';
import styles from './Dashboard.module.css';

export function PatientDashboard() {
  const { user, logout } = useAuth();
  
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Welcome, {user?.first_name}!</h1>
        <Button variant="ghost" onClick={logout}>
          <LogOut size={18} />
          Sign Out
        </Button>
      </header>
      
      <main className={styles.main}>
        <div className={styles.card}>
          <MessageCircle size={48} className={styles.icon} />
          <h2>Chat with Nightingale AI</h2>
          <p>Share your health concerns and get empathetic support.</p>
          <Button>Start Chat</Button>
        </div>
        
        <div className={styles.info}>
          <h3>Your Profile</h3>
          <ul>
            <li><strong>Name:</strong> {user?.first_name} {user?.last_name}</li>
            <li><strong>Username:</strong> {user?.username}</li>
            <li><strong>Role:</strong> {user?.role}</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

export function ClinicianDashboard() {
  const { user, logout } = useAuth();
  
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Clinician Dashboard</h1>
        <Button variant="ghost" onClick={logout}>
          <LogOut size={18} />
          Sign Out
        </Button>
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
