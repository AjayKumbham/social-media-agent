// Convert IST date to UTC
export function fromIST(istDate: Date): Date {
  // IST is UTC+5:30
  const utcDate = new Date(istDate.getTime() - (5.5 * 60 * 60 * 1000));
  return utcDate;
}

// Convert UTC date to IST
export function toIST(utcDate: Date): Date {
  // IST is UTC+5:30
  const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
  return istDate;
}

// Get current time in IST using proper timezone
export function getCurrentIST(): Date {
  // Get current UTC time and add IST offset (+5:30)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
  return new Date(now.getTime() + istOffset);
}

// Format IST time for display - always show IST time in 24-hour format
export function formatISTTime(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false // Always use 24-hour format
  };
  
  const formatOptions = { ...defaultOptions, ...options };
  return dateObj.toLocaleString('en-IN', formatOptions);
}

// Get current IST time formatted for display in 24-hour format
export function getCurrentISTFormatted(): string {
  const now = new Date();
  return now.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false // 24-hour format
  });
}

// Get IST day bounds in UTC for database queries
export function getISTDayBoundsUTC(date?: Date): { startUTC: Date; endUTC: Date } {
  const targetDate = date || getCurrentIST();
  
  // Create start of day in IST (00:00:00)
  const startIST = new Date(targetDate);
  startIST.setHours(0, 0, 0, 0);
  
  // Create end of day in IST (23:59:59.999)
  const endIST = new Date(targetDate);
  endIST.setHours(23, 59, 59, 999);
  
  // Convert to UTC for database queries
  const startUTC = fromIST(startIST);
  const endUTC = fromIST(endIST);
  
  return { startUTC, endUTC };
}

// Helper to check if a time string matches current IST hour/minute
export function isTimeInCurrentISTHour(timeString: string): boolean {
  const istNow = getCurrentIST();
  const [hours, minutes] = timeString.split(':').map(Number);
  
  return istNow.getHours() === hours && Math.abs(istNow.getMinutes() - minutes) <= 5;
}

// Helper to get next occurrence of a time in IST
export function getNextOccurrenceIST(timeString: string, daysOfWeek: number[]): Date {
  const istNow = getCurrentIST();
  const [hours, minutes] = timeString.split(':').map(Number);
  
  // Try today first
  const todayScheduled = new Date(istNow);
  todayScheduled.setHours(hours, minutes, 0, 0);
  
  const currentDayOfWeek = getCurrentISTDayOfWeek();
  
  // If time hasn't passed today and today is in the schedule
  if (todayScheduled > istNow && daysOfWeek.includes(currentDayOfWeek)) {
    return todayScheduled;
  }
  
  // Find next day in the schedule
  for (let i = 1; i <= 7; i++) {
    const checkDay = (currentDayOfWeek + i) % 7;
    if (daysOfWeek.includes(checkDay)) {
      const nextDate = new Date(istNow);
      nextDate.setDate(nextDate.getDate() + i);
      nextDate.setHours(hours, minutes, 0, 0);
      return nextDate;
    }
  }
  
  // Fallback to tomorrow
  const tomorrow = new Date(istNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(hours, minutes, 0, 0);
  return tomorrow;
}

// Get current UTC timestamp for database operations
export function getCurrentUTCTimestamp(): string {
  return new Date().toISOString();
}

// Get current IST timestamp for database operations
export function getCurrentISTTimestamp(): string {
  return getCurrentIST().toISOString();
}

// Format relative time (e.g., "2 hours ago") with IST awareness
export function formatRelativeTime(timestamp: string | Date): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  // For older dates, use IST formatting in 24-hour format
  return formatISTTime(timestamp, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false // 24-hour format
  });
}

// Validate if a time string is in correct 24-hour format
export function isValidTimeFormat(timeString: string): boolean {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(timeString);
}

// Get next scheduled time with proper IST handling
export function getNextScheduledTime(timeString: string, daysOfWeek: number[], addDays: number = 0): Date {
  const istNow = getCurrentIST();
  const [hours, minutes] = timeString.split(':').map(Number);
  
  const nextTime = new Date(istNow);
  nextTime.setDate(nextTime.getDate() + addDays);
  nextTime.setHours(hours, minutes, 0, 0);
  
  return nextTime;
}

// Get current IST time as a simple string for display (24-hour format)
export function getCurrentISTTimeString(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false // 24-hour format
  });
}

// Get current IST date as a simple string for display
export function getCurrentISTDateString(): string {
  const now = new Date();
  return now.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

// Get current IST day of week (0=Sunday, 1=Monday, etc.)
export function getCurrentISTDayOfWeek(): number {
  const istNow = getCurrentIST();
  return istNow.getDay();
}
