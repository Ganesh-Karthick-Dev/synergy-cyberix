/**
 * Subscription Service - Handles user subscription, plan info, and restrictions
 */

const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://your-backend-domain.com'
  : 'http://127.0.0.1:4005';

class SubscriptionService {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.cache = {
      planInfo: null,
      projects: null,
      lastFetch: null,
      cacheDuration: 60000 // 1 minute cache
    };
  }

  /**
   * Get authentication token from storage
   */
  getAuthToken() {
    // Try multiple sources
    let token = 
      localStorage.getItem('auth_token') ||
      sessionStorage.getItem('auth_token') ||
      (window.cyberGuard && window.cyberGuard.getAuthToken && window.cyberGuard.getAuthToken());
    
    // If no token in storage, try to get from cookies (for Electron/desktop apps)
    if (!token && typeof document !== 'undefined') {
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'accessToken' && value) {
          token = value;
          // Also store in localStorage for future use
          try {
            localStorage.setItem('auth_token', value);
            console.log('📊 [Subscription] Token found in cookies, stored in localStorage');
          } catch (e) {
            console.warn('📊 [Subscription] Could not store token in localStorage:', e);
          }
          break;
        }
      }
    }
    
    if (!token) {
      console.warn('⚠️ [Subscription] No authentication token found in any source');
    } else {
      console.log('✅ [Subscription] Token found, length:', token.length);
    }
    
    return token;
  }

  /**
   * Get user's active subscription with validity dates
   */
  async getActiveSubscription() {
    try {
      const token = this.getAuthToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      console.log('📊 [Subscription] Fetching active subscription...');
      const response = await fetch(`${this.baseURL}/api/plans/subscription/active`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Try to refresh token
          const refreshed = await this.tryRefreshToken();
          if (refreshed) {
            // Retry the request with new token
            return await this.getActiveSubscription();
          }
          throw new Error('Authentication required. Please log in again.');
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to fetch subscription');
      }

      const data = await response.json();
      
      if (data.success) {
        console.log('✅ [Subscription] Active subscription fetched:', data.data);
        return data.data; // Can be null if no active subscription
      }

      return null;
    } catch (error) {
      console.error('❌ [Subscription] Error fetching active subscription:', error);
      throw error;
    }
  }

  /**
   * Get user's plan information with usage stats
   */
  async getUserPlanInfo() {
    try {
      // Check cache first
      const now = Date.now();
      if (this.cache.planInfo && this.cache.lastFetch && (now - this.cache.lastFetch) < this.cache.cacheDuration) {
        console.log('📊 [Subscription] Using cached plan info');
        return this.cache.planInfo;
      }

      const token = this.getAuthToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      console.log('📊 [Subscription] Fetching user plan info...');
      const response = await fetch(`${this.baseURL}/api/projects/plan/info`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Try to refresh token
          const refreshed = await this.tryRefreshToken();
          if (refreshed) {
            // Retry the request with new token
            return await this.getUserPlanInfo();
          }
          throw new Error('Authentication required. Please log in again.');
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to fetch plan information');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        this.cache.planInfo = data.data;
        this.cache.lastFetch = now;
        console.log('✅ [Subscription] Plan info fetched:', data.data);
        return data.data;
      }

      throw new Error('Invalid response format');
    } catch (error) {
      console.error('❌ [Subscription] Error fetching plan info:', error);
      throw error;
    }
  }

  /**
   * Get all user projects
   */
  async getUserProjects() {
    try {
      const token = this.getAuthToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      console.log('📁 [Subscription] Fetching user projects...');
      const response = await fetch(`${this.baseURL}/api/projects`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.');
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to fetch projects');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        this.cache.projects = data.data;
        console.log('✅ [Subscription] Projects fetched:', data.data.length);
        return data.data;
      }

      return [];
    } catch (error) {
      console.error('❌ [Subscription] Error fetching projects:', error);
      throw error;
    }
  }

  /**
   * Create a new project
   */
  async createProject(name, description = '', target = '') {
    try {
      const token = this.getAuthToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      console.log('📁 [Subscription] Creating project:', name);
      const response = await fetch(`${this.baseURL}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          name,
          description,
          target
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to create project');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        // Invalidate cache
        this.cache.projects = null;
        this.cache.planInfo = null;
        console.log('✅ [Subscription] Project created:', data.data.id);
        return data.data;
      }

      throw new Error('Invalid response format');
    } catch (error) {
      console.error('❌ [Subscription] Error creating project:', error);
      throw error;
    }
  }

  /**
   * Check if user can create a project
   */
  async canCreateProject() {
    try {
      const planInfo = await this.getUserPlanInfo();
      const { limits, usage } = planInfo;

      // Unlimited projects
      if (limits.maxProjects === -1) {
        return { allowed: true };
      }

      // Check if user has reached the limit
      if (usage.projects >= limits.maxProjects) {
        return {
          allowed: false,
          reason: `You have reached the maximum limit of ${limits.maxProjects} project(s) for your ${planInfo.planName} plan. Please upgrade to create more projects.`,
          current: usage.projects,
          limit: limits.maxProjects
        };
      }

      return {
        allowed: true,
        current: usage.projects,
        limit: limits.maxProjects,
        remaining: limits.maxProjects - usage.projects
      };
    } catch (error) {
      console.error('❌ [Subscription] Error checking project limit:', error);
      return { allowed: false, reason: 'Unable to verify project limit. Please try again.' };
    }
  }

  /**
   * Check if user can run a scan on a project
   */
  async canRunScan(projectId) {
    try {
      if (!projectId) {
        return { allowed: false, reason: 'Project ID is required' };
      }

      const token = this.getAuthToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Get project stats
      const response = await fetch(`${this.baseURL}/api/projects/${projectId}/stats`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to check scan limit');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        const { scans } = data.data;
        
        // Unlimited scans
        if (scans.limit === 'Unlimited' || scans.limit === -1) {
          return { allowed: true, unlimited: true };
        }

        // Check if user has reached the limit
        if (scans.remaining === 0) {
          const planInfo = await this.getUserPlanInfo();
          return {
            allowed: false,
            reason: `You have reached the maximum limit of ${scans.limit} scan(s) per project for your ${planInfo.planName} plan. Please upgrade to run more scans.`,
            current: scans.count,
            limit: scans.limit,
            remaining: 0
          };
        }

        return {
          allowed: true,
          current: scans.count,
          limit: scans.limit,
          remaining: scans.remaining
        };
      }

      throw new Error('Invalid response format');
    } catch (error) {
      console.error('❌ [Subscription] Error checking scan limit:', error);
      return { allowed: false, reason: 'Unable to verify scan limit. Please try again.' };
    }
  }

  /**
   * Create a security report (scan result) linked to a project
   */
  async createScanReport(projectId, toolId, title, content, severity = 'MEDIUM', metadata = {}) {
    try {
      const token = this.getAuthToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      console.log('📝 [Subscription] Creating scan report for project:', projectId);
      const response = await fetch(`${this.baseURL}/api/security-reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          projectId,
          toolId,
          title,
          content,
          severity,
          status: 'OPEN',
          metadata
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to create scan report');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        // Invalidate cache to refresh counts
        this.cache.planInfo = null;
        this.cache.projects = null;
        console.log('✅ [Subscription] Scan report created:', data.data.id);
        return data.data;
      }

      throw new Error('Invalid response format');
    } catch (error) {
      console.error('❌ [Subscription] Error creating scan report:', error);
      throw error;
    }
  }

  /**
   * Try to refresh the access token using refresh token
   */
  async tryRefreshToken() {
    try {
      const refreshToken = 
        localStorage.getItem('refresh_token') ||
        sessionStorage.getItem('refresh_token');
      
      if (!refreshToken) {
        console.warn('⚠️ [Subscription] No refresh token available');
        return false;
      }

      console.log('🔄 [Subscription] Attempting to refresh token...');
      const response = await fetch(`${this.baseURL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ refreshToken })
      });

      if (!response.ok) {
        console.warn('⚠️ [Subscription] Token refresh failed');
        return false;
      }

      const data = await response.json();
      
      if (data.success && data.data?.token) {
        // Store new token
        try {
          localStorage.setItem('auth_token', data.data.token);
          if (data.data.refreshToken) {
            localStorage.setItem('refresh_token', data.data.refreshToken);
          }
          console.log('✅ [Subscription] Token refreshed successfully');
          // Clear cache to force refresh
          this.clearCache();
          return true;
        } catch (e) {
          console.warn('⚠️ [Subscription] Could not store refreshed token:', e);
          return false;
        }
      }

      return false;
    } catch (error) {
      console.error('❌ [Subscription] Error refreshing token:', error);
      return false;
    }
  }

  /**
   * Clear cache (call after logout or when data needs refresh)
   */
  clearCache() {
    this.cache = {
      planInfo: null,
      projects: null,
      lastFetch: null,
      cacheDuration: 60000
    };
    console.log('📊 [Subscription] Cache cleared');
  }

  /**
   * Force refresh plan info (bypasses cache)
   */
  async refreshPlanInfo() {
    this.clearCache();
    return await this.getUserPlanInfo();
  }

  /**
   * Format plan name for display
   */
  formatPlanName(planName) {
    const planMap = {
      'FREE': 'Free',
      'PRO': 'Pro',
      'PRO_PLUS': 'Pro Plus'
    };
    return planMap[planName] || planName;
  }

  /**
   * Format limit for display
   */
  formatLimit(limit) {
    if (limit === -1 || limit === 'Unlimited') {
      return 'Unlimited';
    }
    return limit;
  }
}

// Export singleton instance
const subscriptionService = new SubscriptionService();
export default subscriptionService;
