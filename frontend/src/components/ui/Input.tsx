/**
 * Input Component
 * 
 * A styled form input with label and error states.
 * 
 * FORWARDREF EXPLAINED:
 * React.forwardRef allows parent components to get a reference
 * to the underlying <input> element. This is useful for:
 * - Focusing the input programmatically
 * - Form libraries that need direct access
 */

import React, { forwardRef } from 'react';
import styles from './Input.module.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className, ...rest }, ref) => {
    // Generate a unique ID if not provided
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
    
    return (
      <div className={styles.wrapper}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
            {rest.required && <span className={styles.required}>*</span>}
          </label>
        )}
        
        <input
          ref={ref}
          id={inputId}
          className={`${styles.input} ${error ? styles.inputError : ''} ${className || ''}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...rest}
        />
        
        {hint && !error && (
          <p id={`${inputId}-hint`} className={styles.hint}>
            {hint}
          </p>
        )}
        
        {error && (
          <p id={`${inputId}-error`} className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
