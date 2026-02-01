/**
 * Registration Form Component
 * 
 * This form collects all the user registration data.
 * It includes role selection (Patient vs Clinician).
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, AlertCircle, Stethoscope, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button, Input, Select } from '../ui';
import type { UserRole, Gender, RegisterData } from '../../types';
import styles from './AuthForms.module.css';

// Gender options for dropdown
const genderOptions = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export function RegisterForm() {
  const { register, error, clearError, isLoading } = useAuth();
  const navigate = useNavigate();
  
  // FORM STATE
  // We track each field separately for controlled inputs
  const [role, setRole] = useState<UserRole | ''>('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  
  // Form validation errors
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  
  // Track current step (1: role, 2: details)
  const [step, setStep] = useState(1);

  /**
   * Validate all form fields
   */
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    // Username validation
    if (!username.trim()) {
      errors.username = 'Username is required';
    } else if (username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      errors.username = 'Username can only contain letters, numbers, and underscores';
    }
    
    // Password validation
    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    } else if (!/[A-Z]/.test(password)) {
      errors.password = 'Password must contain an uppercase letter';
    } else if (!/[a-z]/.test(password)) {
      errors.password = 'Password must contain a lowercase letter';
    } else if (!/[0-9]/.test(password)) {
      errors.password = 'Password must contain a number';
    } else if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      errors.password = 'Password must contain a special character';
    }
    
    // Confirm password
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    
    // Name validation
    if (!firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    if (!lastName.trim()) {
      errors.lastName = 'Last name is required';
    }
    
    // Date of birth
    if (!dateOfBirth) {
      errors.dateOfBirth = 'Date of birth is required';
    } else {
      const dob = new Date(dateOfBirth);
      const now = new Date();
      if (dob >= now) {
        errors.dateOfBirth = 'Date of birth must be in the past';
      }
    }
    
    // Gender
    if (!gender) {
      errors.gender = 'Please select a gender';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /**
   * Handle role selection (step 1)
   */
  const handleRoleSelect = (selectedRole: UserRole) => {
    setRole(selectedRole);
    setStep(2);
    clearError();
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    
    if (!validateForm()) {
      return;
    }
    
    const data: RegisterData = {
      username: username.trim().toLowerCase(),
      password,
      role: role as UserRole,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      date_of_birth: dateOfBirth,
      gender: gender as Gender,
    };
    
    try {
      await register(data);
      navigate('/');
    } catch {
      // Error is handled by AuthContext
    }
  };

  /**
   * Go back to role selection
   */
  const handleBack = () => {
    setStep(1);
    clearError();
  };

  // STEP 1: Role Selection
  if (step === 1) {
    return (
      <div className={styles.form}>
        <div className={styles.header}>
          <div className={styles.iconWrapper}>
            <UserPlus size={24} />
          </div>
          <h2 className={styles.title}>Create Account</h2>
          <p className={styles.subtitle}>Choose your role to get started</p>
        </div>
        
        <div className={styles.roleSelection}>
          <button
            type="button"
            className={`${styles.roleCard} ${role === 'patient' ? styles.roleCardSelected : ''}`}
            onClick={() => handleRoleSelect('patient')}
          >
            <User size={32} className={styles.roleIcon} />
            <span className={styles.roleTitle}>Patient</span>
            <span className={styles.roleDescription}>
              Chat with Nightingale AI about your health concerns
            </span>
          </button>
          
          <button
            type="button"
            className={`${styles.roleCard} ${role === 'clinician' ? styles.roleCardSelected : ''}`}
            onClick={() => handleRoleSelect('clinician')}
          >
            <Stethoscope size={32} className={styles.roleIcon} />
            <span className={styles.roleTitle}>Clinician</span>
            <span className={styles.roleDescription}>
              Review escalated cases and respond to patients
            </span>
          </button>
        </div>
        
        <p className={styles.footer}>
          Already have an account?{' '}
          <Link to="/login">Sign in</Link>
        </p>
      </div>
    );
  }

  // STEP 2: Registration Form
  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.header}>
        <div className={styles.iconWrapper}>
          {role === 'patient' ? <User size={24} /> : <Stethoscope size={24} />}
        </div>
        <h2 className={styles.title}>
          {role === 'patient' ? 'Patient' : 'Clinician'} Registration
        </h2>
        <p className={styles.subtitle}>Fill in your details below</p>
      </div>
      
      {/* API Error Display */}
      {error && (
        <div className={styles.alert} role="alert">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}
      
      <div className={styles.fields}>
        <div className={styles.row}>
          <Input
            label="First Name"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={formErrors.firstName}
            placeholder="John"
            autoComplete="given-name"
            required
          />
          
          <Input
            label="Last Name"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            error={formErrors.lastName}
            placeholder="Doe"
            autoComplete="family-name"
            required
          />
        </div>
        
        <Input
          label="Username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={formErrors.username}
          placeholder="johndoe"
          hint="3-30 characters, letters, numbers, and underscores only"
          autoComplete="username"
          required
        />
        
        <div className={styles.row}>
          <Input
            label="Date of Birth"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            error={formErrors.dateOfBirth}
            required
          />
          
          <Select
            label="Gender"
            value={gender}
            onChange={(e) => setGender(e.target.value as Gender)}
            options={genderOptions}
            error={formErrors.gender}
            placeholder="Select gender"
            required
          />
        </div>
        
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={formErrors.password}
          placeholder="Create a strong password"
          hint="Min 8 chars, uppercase, lowercase, number, special char"
          autoComplete="new-password"
          required
        />
        
        <Input
          label="Confirm Password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={formErrors.confirmPassword}
          placeholder="Confirm your password"
          autoComplete="new-password"
          required
        />
      </div>
      
      <div className={styles.buttons}>
        <Button
          type="button"
          variant="outline"
          onClick={handleBack}
        >
          Back
        </Button>
        
        <Button
          type="submit"
          isLoading={isLoading}
          size="lg"
        >
          Create Account
        </Button>
      </div>
      
      <p className={styles.footer}>
        Already have an account?{' '}
        <Link to="/login">Sign in</Link>
      </p>
    </form>
  );
}

export default RegisterForm;
