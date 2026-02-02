/**
 * Health Profile Panel Component
 * 
 * Displays extracted health information from user's chat messages:
 * - Chief complaint
 * - Key symptoms (with timeline if present)
 * - Current medications
 * - Allergies
 */

import { useState, useEffect } from 'react';
import { 
  Stethoscope, 
  Activity, 
  Pill, 
  AlertCircle, 
  Loader2,
  ChevronRight,
  PanelRightClose
} from 'lucide-react';
import { getPatientMemory } from '../../services/api';
import { Button } from '../ui';
import type { PatientMemory } from '../../types';
import styles from './HealthProfilePanel.module.css';

interface HealthProfilePanelProps {
  conversationId?: string;
  onClose?: () => void;
  refreshTrigger?: number; // Increment this to trigger a refresh
  onScrollToMessage?: (messageId: string) => void; // Callback to scroll to source message
}

interface GroupedMemory {
  chief_complaint: PatientMemory[];
  symptom: PatientMemory[];
  medication: PatientMemory[];
  allergy: PatientMemory[];
  condition: PatientMemory[];
  other: PatientMemory[];
}

export function HealthProfilePanel({ conversationId, onClose, refreshTrigger, onScrollToMessage }: HealthProfilePanelProps) {
  const [memory, setMemory] = useState<GroupedMemory>({
    chief_complaint: [],
    symptom: [],
    medication: [],
    allergy: [],
    condition: [],
    other: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load on mount and when conversationId or refreshTrigger changes
  useEffect(() => {
    loadMemory();
  }, [conversationId, refreshTrigger]);

  async function loadMemory() {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getPatientMemory();
      
      // Group the memory items by type
      const grouped: GroupedMemory = {
        chief_complaint: [],
        symptom: [],
        medication: [],
        allergy: [],
        condition: [],
        other: [],
      };
      
      for (const item of data.items) {
        const type = item.memory_type as keyof GroupedMemory;
        if (grouped[type]) {
          grouped[type].push(item);
        } else {
          grouped.other.push(item);
        }
      }
      
      setMemory(grouped);
    } catch (err) {
      console.error('Failed to load health profile:', err);
      setError('Failed to load health profile');
    } finally {
      setIsLoading(false);
    }
  }

  const hasAnyData = Object.values(memory).some(arr => arr.length > 0);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>Health Profile</h3>
        <div className={styles.headerActions}>
          {onClose && (
            <button
              className={styles.closeBtn}
              onClick={onClose}
              title="Hide panel"
            >
              <PanelRightClose size={18} />
            </button>
          )}
        </div>
      </div>

      <div className={styles.content}>
        {isLoading && !hasAnyData ? (
          <div className={styles.loading}>
            <Loader2 className={styles.spinner} size={24} />
            <span>Loading health profile...</span>
          </div>
        ) : error ? (
          <div className={styles.error}>
            <AlertCircle size={20} />
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadMemory}>
              Retry
            </Button>
          </div>
        ) : !hasAnyData ? (
          <div className={styles.empty}>
            <Stethoscope size={32} />
            <p>No health information yet</p>
            <span>Start chatting to build your health profile</span>
          </div>
        ) : (
          <>
            {/* Chief Complaint */}
            {memory.chief_complaint.length > 0 && (
              <Section
                icon={<Stethoscope size={18} />}
                title="Chief Complaint"
                items={memory.chief_complaint}
                variant="primary"
                onScrollToMessage={onScrollToMessage}
              />
            )}

            {/* Symptoms */}
            {memory.symptom.length > 0 && (
              <Section
                icon={<Activity size={18} />}
                title="Key Symptoms"
                items={memory.symptom}
                showTimeline
                onScrollToMessage={onScrollToMessage}
              />
            )}

            {/* Medications */}
            {memory.medication.length > 0 && (
              <Section
                icon={<Pill size={18} />}
                title="Current Medications"
                items={memory.medication}
                onScrollToMessage={onScrollToMessage}
              />
            )}

            {/* Allergies */}
            {memory.allergy.length > 0 && (
              <Section
                icon={<AlertCircle size={18} />}
                title="Allergies"
                items={memory.allergy}
                variant="warning"
                onScrollToMessage={onScrollToMessage}
              />
            )}

            {/* Conditions */}
            {memory.condition.length > 0 && (
              <Section
                icon={<Activity size={18} />}
                title="Known Conditions"
                items={memory.condition}
                onScrollToMessage={onScrollToMessage}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  items: PatientMemory[];
  showTimeline?: boolean;
  variant?: 'default' | 'primary' | 'warning';
  onScrollToMessage?: (messageId: string) => void;
}

function Section({ icon, title, items, showTimeline, variant = 'default', onScrollToMessage }: SectionProps) {
  return (
    <div className={`${styles.section} ${styles[variant]}`}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionIcon}>{icon}</span>
        <h4>{title}</h4>
      </div>
      <ul className={styles.sectionList}>
        {items.map((item) => (
          <li key={item.id} className={`${styles.sectionItem} ${item.status !== 'active' ? styles.inactive : ''}`}>
            <ChevronRight size={14} className={styles.itemBullet} />
            <div className={styles.itemContent}>
              <span className={styles.itemValue}>
                {item.value}
                {item.status && item.status !== 'active' && (
                  <span className={styles.statusBadge} data-status={item.status}>
                    {item.status}
                  </span>
                )}
              </span>
              {(showTimeline || item.status !== 'active') && item.timeline && (
                <span className={styles.itemTimeline}>{item.timeline}</span>
              )}
              {/* Provenance: show when fact was last updated */}
              {item.updated_at && (
                <span className={styles.itemProvenance}>
                  Updated {formatRelativeTime(item.updated_at)}
                  {item.provenance_message_id && (
                    <>
                      {' • '}
                      <button
                        type="button"
                        className={styles.provenanceLink}
                        onClick={() => onScrollToMessage?.(item.provenance_message_id!)}
                      >
                        View source
                      </button>
                    </>
                  )}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Format a timestamp as relative time (e.g., "2 minutes ago")
 */
function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default HealthProfilePanel;
