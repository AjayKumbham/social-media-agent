
interface CircuitBreakerConfig {
  failureThreshold: number;
  timeout: number;
  monitoringPeriod: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

export class CircuitBreaker {
  private states: Map<string, CircuitBreakerState> = new Map();
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: 5,
      timeout: 60000, // 1 minute
      monitoringPeriod: 300000, // 5 minutes
      ...config
    };
  }

  async execute<T>(
    key: string, 
    operation: () => Promise<T>, 
    fallback?: () => Promise<T>
  ): Promise<T> {
    const state = this.getState(key);
    
    // Check if circuit is open
    if (state.state === 'open') {
      if (Date.now() - state.lastFailureTime < this.config.timeout) {
        console.warn(`🚫 Circuit breaker open for ${key}, using fallback`);
        if (fallback) {
          return await fallback();
        }
        throw new Error(`Circuit breaker is open for ${key}`);
      } else {
        // Try to close the circuit
        state.state = 'half-open';
        console.log(`🔄 Circuit breaker half-open for ${key}, testing`);
      }
    }

    try {
      const result = await operation();
      
      // Success - reset or close circuit
      if (state.state === 'half-open') {
        state.state = 'closed';
        state.failures = 0;
        console.log(`✅ Circuit breaker closed for ${key}`);
      } else if (state.failures > 0) {
        state.failures = Math.max(0, state.failures - 1);
      }
      
      return result;
    } catch (error) {
      // Failure - increment counter and potentially open circuit
      state.failures++;
      state.lastFailureTime = Date.now();
      
      if (state.failures >= this.config.failureThreshold) {
        state.state = 'open';
        console.error(`💥 Circuit breaker opened for ${key} after ${state.failures} failures`);
      }
      
      if (fallback && state.state === 'open') {
        console.warn(`🔄 Using fallback for ${key}`);
        return await fallback();
      }
      
      throw error;
    }
  }

  private getState(key: string): CircuitBreakerState {
    if (!this.states.has(key)) {
      this.states.set(key, {
        failures: 0,
        lastFailureTime: 0,
        state: 'closed'
      });
    }
    return this.states.get(key)!;
  }

  getStatus(key: string) {
    const state = this.states.get(key);
    if (!state) return { state: 'closed', failures: 0 };
    
    return {
      state: state.state,
      failures: state.failures,
      lastFailureTime: state.lastFailureTime
    };
  }

  reset(key: string) {
    const state = this.getState(key);
    state.failures = 0;
    state.state = 'closed';
    state.lastFailureTime = 0;
    console.log(`🔄 Circuit breaker reset for ${key}`);
  }

  // Get status of all circuit breakers
  getAllStatus() {
    const result: Record<string, any> = {};
    for (const [key, state] of this.states.entries()) {
      result[key] = {
        state: state.state,
        failures: state.failures,
        lastFailureTime: state.lastFailureTime,
        isHealthy: state.state === 'closed' && state.failures < this.config.failureThreshold / 2
      };
    }
    return result;
  }
}

export const platformCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3, // Open after 3 failures
  timeout: 300000, // 5 minutes timeout
  monitoringPeriod: 900000 // 15 minutes monitoring period
});
