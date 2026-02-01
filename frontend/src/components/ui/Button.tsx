/**
 * Button Component
 * 
 * A reusable button with different variants and sizes.
 * 
 * PROPS EXPLAINED:
 * - variant: Visual style (primary, secondary, outline, ghost)
 * - size: Dimensions (sm, md, lg)
 * - isLoading: Shows a spinner and disables the button
 * - disabled: Disables the button
 * - children: The button content (text, icons, etc.)
 * - ...rest: Passes any other props to the underlying <button>
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import styles from './Button.module.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  // Combine class names
  const classNames = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : '',
    isLoading ? styles.loading : '',
    className || '',
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classNames}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading && (
        <Loader2 className={styles.spinner} size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
      )}
      <span className={isLoading ? styles.hiddenText : ''}>{children}</span>
    </button>
  );
}

export default Button;
