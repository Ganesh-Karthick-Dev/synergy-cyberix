// Authentication service for backend API integration
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://your-backend-domain.com' // Replace with your production backend URL
  : 'http://127.0.0.1:4005'; // Use IPv4 explicitly to avoid IPv6 resolution issues

class AuthService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  // Login with backend API
  async login(email, password, deviceInfo = {}) {
    console.log('🔐 [AuthService] ===== LOGIN ATTEMPT START =====');
    console.log('🔐 [AuthService] Email:', email);
    console.log('🔐 [AuthService] Password length:', password ? password.length : 0);
    console.log('🔐 [AuthService] Base URL:', this.baseURL);
    console.log('🔐 [AuthService] Full URL:', `${this.baseURL}/api/auth/login`);

    try {
      // Check if we can reach the server first
      console.log('🔐 [AuthService] Testing server connectivity...');
      const testResponse = await fetch(`${this.baseURL}/health`, {
        method: 'GET',
        credentials: 'include',
      }).catch(err => {
        console.error('❌ [AuthService] Health check failed:', err.message);
        throw new Error(`Cannot connect to server: ${err.message}`);
      });

      console.log('✅ [AuthService] Health check passed:', testResponse.status);

      // Prepare login request
      const loginData = {
        email: email.trim(),
        password,
        deviceInfo: {
          platform: navigator.platform || 'unknown',
          userAgent: navigator.userAgent || 'unknown',
          language: navigator.language || 'en',
          timestamp: new Date().toISOString(),
          ...deviceInfo
        }
      };

      console.log('🔐 [AuthService] Login payload prepared');
      console.log('🔐 [AuthService] Device info:', loginData.deviceInfo);

      console.log('🔐 [AuthService] Making login request...');
      const response = await fetch(`${this.baseURL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for cross-origin requests
        body: JSON.stringify(loginData)
      });

      console.log('🔐 [AuthService] Response received');
      console.log('🔐 [AuthService] Response status:', response.status);
      console.log('🔐 [AuthService] Response headers:', Object.fromEntries(response.headers.entries()));

      let data;
      try {
        data = await response.json();
        console.log('🔐 [AuthService] Response data:', data);
      } catch (parseError) {
        console.error('❌ [AuthService] Failed to parse response JSON:', parseError);
        throw new Error('Invalid response from server');
      }

      if (!response.ok) {
        console.error('❌ [AuthService] Response not OK');
        console.error('❌ [AuthService] Response status:', response.status);
        console.error('❌ [AuthService] Response data:', data);

        // Handle specific error cases
        if (response.status === 423) {
          // Account blocked
          console.log('🚫 [AuthService] Account blocked');
          throw new Error(data.error?.message || 'Account temporarily blocked');
        } else if (response.status === 401) {
          console.log('❌ [AuthService] Invalid credentials');
          throw new Error(data.error?.message || 'Invalid credentials');
        } else if (response.status === 429) {
          console.log('⏰ [AuthService] Too many attempts');
          throw new Error('Too many login attempts. Please try again later.');
        } else if (response.status === 0) {
          console.log('🌐 [AuthService] Network error');
          throw new Error('Network connection failed. Check if server is running.');
        } else {
          console.log('❌ [AuthService] Unknown error:', response.status);
          throw new Error(data.error?.message || `Login failed (${response.status})`);
        }
      }

      console.log('✅ [AuthService] Login successful for:', email);
      console.log('✅ [AuthService] User data:', data.data.user);
      console.log('🔐 [AuthService] ===== LOGIN ATTEMPT END =====');

      return {
        success: true,
        user: data.data.user,
        message: data.message
      };

    } catch (error) {
      console.error('❌ [AuthService] ===== LOGIN ERROR =====');
      console.error('❌ [AuthService] Error type:', error.constructor.name);
      console.error('❌ [AuthService] Error message:', error.message);
      console.error('❌ [AuthService] Error stack:', error.stack);

      if (error.message.includes('fetch')) {
        console.error('🌐 [AuthService] This is a network/connection error');
        console.error('🔧 [AuthService] Check if backend server is running on:', this.baseURL);
      }

      console.log('🔐 [AuthService] ===== END LOGIN ERROR =====');
      throw error;
    }
  }

  // Logout from backend
  async logout() {
    try {
      console.log('🔐 [AuthService] Attempting logout');

      const response = await fetch(`${this.baseURL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for cross-origin requests
      });

      const data = await response.json();

      if (!response.ok) {
        console.warn('⚠️ [AuthService] Logout API call failed, but proceeding with local cleanup');
      }

      console.log('✅ [AuthService] Logout successful');
      return {
        success: true,
        message: data.message || 'Logged out successfully'
      };

    } catch (error) {
      console.error('❌ [AuthService] Logout error:', error.message);
      // Don't throw error for logout failures - just log and continue
      return {
        success: true,
        message: 'Logged out locally (server logout may have failed)'
      };
    }
  }

  // Check if user is authenticated by checking cookies
  async checkAuthStatus() {
    try {
      // Check if isAuthenticated cookie exists
      const cookies = document.cookie.split(';');
      const isAuthenticated = cookies.some(cookie =>
        cookie.trim().startsWith('isAuthenticated=')
      );

      if (!isAuthenticated) {
        return { authenticated: false };
      }

      // Try to get user profile to verify token is valid
      const profileResponse = await fetch(`${this.baseURL}/api/auth/profile`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        return {
          authenticated: true,
          user: profileData.data
        };
      } else {
        // Token is invalid or expired
        return { authenticated: false };
      }

    } catch (error) {
      console.error('❌ [AuthService] Auth status check error:', error.message);
      return { authenticated: false };
    }
  }

  // Refresh access token
  async refreshToken() {
    try {
      console.log('🔐 [AuthService] Refreshing access token');

      const response = await fetch(`${this.baseURL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Token refresh failed');
      }

      console.log('✅ [AuthService] Token refreshed successfully');
      return {
        success: true,
        message: data.message
      };

    } catch (error) {
      console.error('❌ [AuthService] Token refresh error:', error.message);
      throw error;
    }
  }

  // Get user profile
  async getProfile() {
    try {
      const response = await fetch(`${this.baseURL}/api/auth/profile`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to get profile');
      }

      return data.data;

    } catch (error) {
      console.error('❌ [AuthService] Get profile error:', error.message);
      throw error;
    }
  }

  // Get login block status
  async getBlockStatus(email) {
    try {
      const response = await fetch(`${this.baseURL}/api/auth/block-status/${email}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to get block status');
      }

      return data.data;

    } catch (error) {
      console.error('❌ [AuthService] Get block status error:', error.message);
      throw error;
    }
  }

  // Logout from all devices
  async logoutAllDevices() {
    try {
      const response = await fetch(`${this.baseURL}/api/auth/logout-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to logout from all devices');
      }

      return data.data;

    } catch (error) {
      console.error('❌ [AuthService] Logout all devices error:', error.message);
      throw error;
    }
  }

  // Get session status
  async getSessionStatus() {
    try {
      const response = await fetch(`${this.baseURL}/api/auth/session-status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to get session status');
      }

      return data.data;

    } catch (error) {
      console.error('❌ [AuthService] Get session status error:', error.message);
      throw error;
    }
  }

  // Get login logs
  async getLoginLogs(options = {}) {
    try {
      const { page = 1, limit = 50, userId } = options;
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (userId) {
        params.append('userId', userId);
      }

      const response = await fetch(`${this.baseURL}/api/auth/login-logs?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to get login logs');
      }

      return data.data;

    } catch (error) {
      console.error('❌ [AuthService] Get login logs error:', error.message);
      throw error;
    }
  }
}

// Create singleton instance
const authService = new AuthService();

export default authService;
