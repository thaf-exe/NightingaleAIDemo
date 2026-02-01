/**
 * Select Component
 * 
 * A styled dropdown select input.
 */

import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, id, className, ...rest }, ref) => {
    const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;
    
    return (
      <div className={styles.wrapper}>
        {label && (
          <label htmlFor={selectId} className={styles.label}>
            {label}
            {rest.required && <span className={styles.required}>*</span>}
          </label>
        )}
        
        <div className={styles.selectWrapper}>
          <select
            ref={ref}
            id={selectId}
            className={`${styles.select} ${error ? styles.selectError : ''} ${className || ''}`}
            aria-invalid={!!error}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className={styles.icon} size={20} />
        </div>
        
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;
