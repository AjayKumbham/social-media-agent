import { supabase } from '@/integrations/supabase/client';
import { getCurrentISTTimestamp } from '@/utils/timeUtils';

export interface SecurityEvent {
  eventType: string;
  eventDetails?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

class SecurityService {
  async logSecurityEvent(event: SecurityEvent) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('security_audit_logs')
        .insert({
          user_id: user?.id || null,
          event_type: event.eventType,
          event_details: event.eventDetails || {},
          ip_address: event.ipAddress,
          user_agent: event.userAgent || navigator.userAgent
        });

      if (error) {
        console.error('Failed to log security event:', error);
      }
    } catch (error) {
      console.error('Security logging error:', error);
    }
  }

  async logLoginAttempt(success: boolean, email?: string) {
    await this.logSecurityEvent({
      eventType: success ? 'login_success' : 'login_failed',
      eventDetails: { 
        email: email ? this.maskEmail(email) : undefined,
        timestamp: getCurrentISTTimestamp()
      }
    });
  }

  async logCredentialAccess(apiType: string, action: 'view' | 'create' | 'update' | 'delete') {
    await this.logSecurityEvent({
      eventType: 'credential_access',
      eventDetails: {
        api_type: apiType,
        action,
        timestamp: getCurrentISTTimestamp()
      }
    });
  }

  async logSuspiciousActivity(activity: string, details?: Record<string, any>) {
    await this.logSecurityEvent({
      eventType: 'suspicious_activity',
      eventDetails: {
        activity,
        ...details,
        timestamp: getCurrentISTTimestamp()
      }
    });
  }

  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (localPart.length <= 2) return `**@${domain}`;
    return `${localPart.slice(0, 2)}***@${domain}`;
  }

  // Input validation helpers
  validateEmail(email: string): { valid: boolean; error?: string } {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!email) {
      return { valid: false, error: 'Email is required' };
    }
    
    if (!emailRegex.test(email)) {
      return { valid: false, error: 'Invalid email format' };
    }
    
    if (email.length > 254) {
      return { valid: false, error: 'Email too long' };
    }
    
    return { valid: true };
  }

  validatePassword(password: string): { valid: boolean; error?: string; strength: number } {
    if (!password) {
      return { valid: false, error: 'Password is required', strength: 0 };
    }
    
    if (password.length < 8) {
      return { valid: false, error: 'Password must be at least 8 characters', strength: 0 };
    }
    
    let strength = 0;
    const checks = [
      /[a-z]/.test(password), // lowercase
      /[A-Z]/.test(password), // uppercase
      /\d/.test(password),    // numbers
      /[^a-zA-Z0-9]/.test(password), // special chars
      password.length >= 12   // length bonus
    ];
    
    strength = checks.filter(Boolean).length;
    
    if (strength < 3) {
      return { 
        valid: false, 
        error: 'Password must contain uppercase, lowercase, and numbers', 
        strength 
      };
    }
    
    return { valid: true, strength };
  }

  sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  // Rate limiting for authentication attempts
  private loginAttempts = new Map<string, { count: number; lastAttempt: number }>();

  checkRateLimit(identifier: string, maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000): boolean {
    const now = Date.now();
    const userAttempts = this.loginAttempts.get(identifier);
    
    if (!userAttempts) {
      this.loginAttempts.set(identifier, { count: 1, lastAttempt: now });
      return true;
    }
    
    // Reset if window has passed
    if (now - userAttempts.lastAttempt > windowMs) {
      this.loginAttempts.set(identifier, { count: 1, lastAttempt: now });
      return true;
    }
    
    // Check if exceeded
    if (userAttempts.count >= maxAttempts) {
      this.logSuspiciousActivity('rate_limit_exceeded', { identifier });
      return false;
    }
    
    // Increment count
    userAttempts.count++;
    userAttempts.lastAttempt = now;
    
    return true;
  }
}

export const securityService = new SecurityService();
