
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const validators = {
  email: (email: string): string => {
    if (!email) throw new ValidationError('Email is required', 'email');
    
    const trimmed = email.trim();
    if (trimmed.length > 254) throw new ValidationError('Email too long', 'email');
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      throw new ValidationError('Invalid email format', 'email');
    }
    
    return trimmed.toLowerCase();
  },

  password: (password: string): string => {
    if (!password) throw new ValidationError('Password is required', 'password');
    
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters', 'password');
    }
    
    if (password.length > 128) {
      throw new ValidationError('Password too long', 'password');
    }
    
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);
    
    if (!hasLower || !hasUpper || !hasNumber) {
      throw new ValidationError('Password must contain uppercase, lowercase, and numbers', 'password');
    }
    
    return password;
  },

  apiKey: (key: string, provider: string): string => {
    if (!key) throw new ValidationError(`${provider} API key is required`, 'apiKey');
    
    const trimmed = key.trim();
    if (trimmed.length < 10) {
      throw new ValidationError(`${provider} API key appears too short`, 'apiKey');
    }
    
    // Remove any potentially dangerous characters
    const sanitized = trimmed.replace(/[<>'"]/g, '');
    if (sanitized !== trimmed) {
      throw new ValidationError('API key contains invalid characters', 'apiKey');
    }
    
    return sanitized;
  },

  url: (url: string): string => {
    if (!url) throw new ValidationError('URL is required', 'url');
    
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new ValidationError('URL must use HTTP or HTTPS', 'url');
      }
      return parsed.toString();
    } catch {
      throw new ValidationError('Invalid URL format', 'url');
    }
  },

  contentText: (text: string, maxLength: number = 5000): string => {
    if (!text) return '';
    
    const trimmed = text.trim();
    if (trimmed.length > maxLength) {
      throw new ValidationError(`Content too long (max ${maxLength} characters)`, 'content');
    }
    
    // Remove potentially dangerous HTML/JS
    const sanitized = trimmed
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
    
    return sanitized;
  },

  platformName: (name: string): string => {
    if (!name) throw new ValidationError('Platform name is required', 'platform');
    
    const allowed = ['twitter', 'linkedin', 'instagram', 'tiktok', 'youtube', 'reddit'];
    const normalized = name.toLowerCase().trim();
    
    if (!allowed.includes(normalized)) {
      throw new ValidationError('Invalid platform name', 'platform');
    }
    
    return normalized;
  }
};

export const sanitizeHtml = (html: string): string => {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '');
};

export const validateAndSanitize = (data: Record<string, any>, rules: Record<string, (value: any) => any>): Record<string, any> => {
  const result: Record<string, any> = {};
  const errors: Record<string, string> = {};
  
  for (const [field, validator] of Object.entries(rules)) {
    try {
      result[field] = validator(data[field]);
    } catch (error) {
      if (error instanceof ValidationError) {
        errors[field] = error.message;
      } else {
        errors[field] = `Validation failed for ${field}`;
      }
    }
  }
  
  if (Object.keys(errors).length > 0) {
    const error = new Error('Validation failed');
    (error as any).validationErrors = errors;
    throw error;
  }
  
  return result;
};
