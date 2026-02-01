/**
 * API Service
 * 
 * This module handles all HTTP communication with the backend.
 * We use Axios for HTTP requests because it:
 * - Automatically transforms JSON
 * - Has better error handling than fetch
 * - Supports interceptors (for adding auth headers)
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type { ApiResponse, AuthResponse, LoginData, RegisterData } from '../types';

// Base URL for API calls
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Create Axios instance with defaults
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 second timeout
});

/**
 * INTERCEPTOR: Add auth token to every request
 * 
 * Interceptors run BEFORE each request/response.
 * This automatically adds the JWT token from localStorage
 * to every outgoing request.
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * INTERCEPTOR: Handle response errors globally
 * 
 * This catches auth errors (401) and can trigger logout
 * or token refresh automatically.
 */
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse>) => {
    // If 401 Unauthorized, clear token and redirect to login
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      // Optionally redirect to login
      // window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/**
 * Extract error message from API error
 */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiResponse>;
    // Return the API error message if available
    if (axiosError.response?.data?.error?.message) {
      return axiosError.response.data.error.message;
    }
    // Network error
    if (axiosError.code === 'ERR_NETWORK') {
      return 'Unable to connect to server. Please check your internet connection.';
    }
    // Timeout
    if (axiosError.code === 'ECONNABORTED') {
      return 'Request timed out. Please try again.';
    }
  }
  // Generic error
  return 'An unexpected error occurred. Please try again.';
}

// ==================
// AUTH API CALLS
// ==================

/**
 * Register a new user
 */
export async function registerUser(data: RegisterData): Promise<AuthResponse> {
  const response = await api.post<ApiResponse<AuthResponse>>('/auth/register', data);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Registration failed');
  }
  return response.data.data;
}

/**
 * Login user
 */
export async function loginUser(data: LoginData): Promise<AuthResponse> {
  const response = await api.post<ApiResponse<AuthResponse>>('/auth/login', data);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Login failed');
  }
  return response.data.data;
}

/**
 * Logout user
 */
export async function logoutUser(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch (error) {
    // Even if logout fails on server, clear local data
    console.error('Logout error:', error);
  }
}

/**
 * Get current user
 */
export async function getCurrentUser(): Promise<ApiResponse<{ user: import('../types').User }>> {
  const response = await api.get<ApiResponse<{ user: import('../types').User }>>('/auth/me');
  return response.data;
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await api.get('/health');
    return response.data.success;
  } catch {
    return false;
  }
}

export default api;
