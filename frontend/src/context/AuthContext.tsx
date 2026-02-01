/**
 * Authentication Context
 * 
 * WHAT IS CONTEXT?
 * Context provides a way to pass data through the component tree
 * without having to pass props manually at every level.
 * 
 * HOW IT WORKS:
 * 1. Create context with createContext()
 * 2. Create a Provider component that holds the state
 * 3. Wrap your app with the Provider
 * 4. Any child component can access the context with useContext()
 * 
 * STRUCTURE:
 * <AuthProvider>           ← Holds user state
 *   <App>
 *     <Header />           ← Can access user via useAuth()
 *     <MainContent>
 *       <Profile />        ← Can access user via useAuth()
 *     </MainContent>
 *   </App>
 * </AuthProvider>
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User, LoginData, RegisterData, AuthContextType } from '../types';
import { loginUser, registerUser, logoutUser, getCurrentUser, getErrorMessage } from '../services/api';

// Create the context with undefined default
// We'll check for undefined in our hook to ensure proper usage
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Storage keys
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

/**
 * AuthProvider Component
 * 
 * This wraps your entire app and provides auth state to all children.
 * It manages:
 * - User state
 * - Token state
 * - Login/logout/register functions
 * - Loading state (for initial auth check)
 * - Error state
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // STATE
  // -----
  // user: The currently logged in user (or null)
  const [user, setUser] = useState<User | null>(null);
  
  // token: The JWT token (or null)
  const [token, setToken] = useState<string | null>(null);
  
  // isLoading: True while checking if user is already logged in
  const [isLoading, setIsLoading] = useState(true);
  
  // error: Any error message to display
  const [error, setError] = useState<string | null>(null);

  /**
   * Check if user is already logged in on mount
   * 
   * useEffect with empty dependency array [] runs ONCE when component mounts.
   * This checks localStorage for existing session.
   */
  useEffect(() => {
    async function initializeAuth() {
      try {
        // Check for existing token in localStorage
        const storedToken = localStorage.getItem(TOKEN_KEY);
        const storedUser = localStorage.getItem(USER_KEY);
        
        if (storedToken && storedUser) {
          // We have stored credentials, verify they're still valid
          setToken(storedToken);
          
          try {
            // Call the API to verify the token is still valid
            const response = await getCurrentUser();
            if (response.success && response.data) {
              setUser(response.data.user);
            } else {
              // Token is invalid, clear storage
              localStorage.removeItem(TOKEN_KEY);
              localStorage.removeItem(USER_KEY);
            }
          } catch {
            // API call failed, clear storage
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            setToken(null);
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        // Always stop loading, even if there was an error
        setIsLoading(false);
      }
    }
    
    initializeAuth();
  }, []); // Empty array = run once on mount

  /**
   * Login function
   * 
   * useCallback memoizes the function so it doesn't get recreated on every render.
   * This is important when passing functions as props or dependencies.
   */
  const login = useCallback(async (data: LoginData) => {
    setError(null);
    setIsLoading(true);
    
    try {
      const response = await loginUser(data);
      
      // Store in localStorage (persists across page refreshes)
      localStorage.setItem(TOKEN_KEY, response.token);
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      
      // Update state
      setToken(response.token);
      setUser(response.user);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw new Error(message); // Re-throw so component can handle it
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Register function
   */
  const register = useCallback(async (data: RegisterData) => {
    setError(null);
    setIsLoading(true);
    
    try {
      const response = await registerUser(data);
      
      // Auto-login after registration
      localStorage.setItem(TOKEN_KEY, response.token);
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      
      setToken(response.token);
      setUser(response.user);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Logout function
   */
  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Always clear local state, even if API call fails
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setToken(null);
      setUser(null);
    }
  }, []);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Computed value: is the user authenticated?
  const isAuthenticated = !!user && !!token;

  // The value object that will be provided to consumers
  const value: AuthContextType = {
    user,
    token,
    isLoading,
    isAuthenticated,
    login,
    register,
    logout,
    error,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Custom hook to use auth context
 * 
 * CUSTOM HOOKS explained:
 * - A custom hook is just a function that uses other hooks
 * - Must start with "use" (React convention)
 * - Allows you to extract and reuse stateful logic
 * 
 * Usage:
 * const { user, login, logout } = useAuth();
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  
  // Ensure the hook is used within AuthProvider
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}

export default AuthContext;
