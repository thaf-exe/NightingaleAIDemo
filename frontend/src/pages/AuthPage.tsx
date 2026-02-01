/**
 * Auth Page Layout
 * 
 * A centered layout for login and registration forms.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import styles from './AuthPage.module.css';

interface AuthPageProps {
  children: ReactNode;
}

export function AuthPage({ children }: AuthPageProps) {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <Link to="/" className={styles.logoLink}>
          <Heart className={styles.logoIcon} size={32} />
          <span className={styles.logoText}>Nightingale AI</span>
        </Link>
        
        {children}
      </div>
      
      <div className={styles.background}>
        <div className={styles.gradient} />
      </div>
    </div>
  );
}

export default AuthPage;
