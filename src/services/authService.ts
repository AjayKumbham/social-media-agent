
import { supabase } from '@/integrations/supabase/client';
import { securityService } from './securityService';

export class AuthService {
  async signUp(email: string, password: string) {
    // Validate inputs
    const emailValidation = securityService.validateEmail(email);
    if (!emailValidation.valid) {
      throw new Error(emailValidation.error);
    }

    const passwordValidation = securityService.validatePassword(password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.error);
    }

    // Check rate limiting
    if (!securityService.checkRateLimit(email)) {
      throw new Error('Too many signup attempts. Please try again later.');
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: securityService.sanitizeInput(email),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}`,
          data: {
            email_confirmed: false
          }
        }
      });

      if (error) {
        await securityService.logSecurityEvent({
          eventType: 'signup_failed',
          eventDetails: { 
            error: error.message,
            email: securityService.validateEmail(email).valid ? email : 'invalid'
          }
        });
        throw error;
      }

      await securityService.logSecurityEvent({
        eventType: 'signup_success',
        eventDetails: { email }
      });

      return data;
    } catch (error: any) {
      throw new Error(error.message || 'Signup failed');
    }
  }

  async signIn(email: string, password: string) {
    // Validate inputs
    const emailValidation = securityService.validateEmail(email);
    if (!emailValidation.valid) {
      throw new Error(emailValidation.error);
    }

    if (!password) {
      throw new Error('Password is required');
    }

    // Check rate limiting
    if (!securityService.checkRateLimit(email)) {
      throw new Error('Too many login attempts. Please try again later.');
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: securityService.sanitizeInput(email),
        password
      });

      if (error) {
        await securityService.logLoginAttempt(false, email);
        throw error;
      }

      await securityService.logLoginAttempt(true, email);
      return data;
    } catch (error: any) {
      throw new Error(error.message || 'Sign in failed');
    }
  }

  async signOut() {
    try {
      await securityService.logSecurityEvent({
        eventType: 'logout',
        eventDetails: { timestamp: new Date().toISOString() }
      });

      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error: any) {
      throw new Error(error.message || 'Sign out failed');
    }
  }

  async resetPassword(email: string) {
    const emailValidation = securityService.validateEmail(email);
    if (!emailValidation.valid) {
      throw new Error(emailValidation.error);
    }

    // Check rate limiting for password resets
    if (!securityService.checkRateLimit(`reset_${email}`, 3)) {
      throw new Error('Too many password reset attempts. Please try again later.');
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        securityService.sanitizeInput(email),
        {
          redirectTo: `${window.location.origin}/reset-password`
        }
      );

      if (error) throw error;

      await securityService.logSecurityEvent({
        eventType: 'password_reset_requested',
        eventDetails: { email }
      });
    } catch (error: any) {
      throw new Error(error.message || 'Password reset failed');
    }
  }
}

export const authService = new AuthService();
