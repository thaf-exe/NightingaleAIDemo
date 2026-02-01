/**
 * Login Form Component
 * 
 * FORM HANDLING IN REACT:
 * 
 * There are two ways to handle forms:
 * 1. Controlled: React state controls the input values (useState for each field)
 * 2. Uncontrolled: DOM controls the values (use refs or FormData)
 * 
 * We'll use a mix: controlled for simple validation, FormData for submission.
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button, Input } from '../ui';
import styles from './AuthForms.module.css';

export function LoginForm() {
  // HOOKS
  // -----
  // useAuth: Our custom hook to access auth functions
  const { login, error, clearError, isLoading } = useAuth();
  
  // useNavigate: React Router hook to navigate programmatically
  const navigate = useNavigate();
  
  // LOCAL STATE
  // -----------
  // Form field values
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // Form-specific errors (not from API)
  const [formErrors, setFormErrors] = useState<{ username?: string; password?: string }>({});

  /**
   * Handle form submission
   * 
   * e.preventDefault() stops the form from doing a full page reload
   * (the default HTML behavior)
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    
    // Basic validation
    const errors: { username?: string; password?: string } = {};
    if (!username.trim()) {
      errors.username = 'Username is required';
    }
    if (!password) {
      errors.password = 'Password is required';
    }
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    
    setFormErrors({});
    
    try {
      await login({ username: username.trim(), password });
      // On success, navigate to appropriate dashboard based on role
      // The navigation will happen in App.tsx based on user role
      navigate('/');
    } catch {
      // Error is handled by AuthContext and displayed below
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.header}>
        <div className={styles.iconWrapper}>
          <LogIn size={24} />
        </div>
        <h2 className={styles.title}>Welcome Back</h2>
        <p className={styles.subtitle}>Sign in to your account</p>
      </div>
      
      {/* API Error Display */}
      {error && (
        <div className={styles.alert} role="alert">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}
      
      <div className={styles.fields}>
        <Input
          label="Username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={formErrors.username}
          placeholder="Enter your username"
          autoComplete="username"
          required
        />
        
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={formErrors.password}
          placeholder="Enter your password"
          autoComplete="current-password"
          required
        />
      </div>
      
      <Button
        type="submit"
        isLoading={isLoading}
        fullWidth
        size="lg"
      >
        Sign In
      </Button>
      
      <p className={styles.footer}>
        Don't have an account?{' '}
        <Link to="/register">Create one</Link>
      </p>
    </form>
  );
}

export default LoginForm;
