const https = require('https');
const http = require('http');

/**
 * GitHub OAuth Device Flow Handler
 * Implements OAuth Device Flow for GitHub authentication without exposing client secret
 */
class GitHubOAuth {
  constructor(clientId) {
    this.clientId = clientId || 'Iv1.8a61f9b7a7e4d1b2'; // GitHub's public client ID for device flow
    this.deviceCode = null;
    this.userCode = null;
    this.verificationUri = null;
    this.interval = 5; // Polling interval in seconds
    this.expiresIn = 900; // 15 minutes
  }

  /**
   * Initiate device flow - get device code and user code
   */
  async initiateDeviceFlow() {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        client_id: this.clientId,
        scope: 'repo read:org read:user'
      });

      const options = {
        hostname: 'github.com',
        path: '/login/device/code',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Synergy-Cyberix-Scanner'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.error) {
              reject(new Error(response.error_description || response.error));
              return;
            }

            this.deviceCode = response.device_code;
            this.userCode = response.user_code;
            this.verificationUri = response.verification_uri;
            this.interval = response.interval || 5;
            this.expiresIn = response.expires_in || 900;

            resolve({
              deviceCode: response.device_code,
              userCode: response.user_code,
              verificationUri: response.verification_uri,
              verificationUriComplete: response.verification_uri_complete,
              expiresIn: response.expires_in,
              interval: response.interval || 5
            });
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Poll for access token
   */
  async pollForToken(deviceCode, userCode, progressCallback = null) {
    return new Promise((resolve, reject) => {
      if (!deviceCode) {
        reject(new Error('Device code not provided.'));
        return;
      }

      this.deviceCode = deviceCode;
      this.userCode = userCode;
      let pollInterval = this.interval;
      const maxAttempts = Math.floor(this.expiresIn / pollInterval);
      let attempts = 0;

      const poll = async () => {
        try {
          attempts++;
          
          if (attempts > maxAttempts) {
            reject(new Error('Device code expired. Please start a new authorization flow.'));
            return;
          }

          const token = await this.checkTokenStatus();
          
          if (token.access_token) {
            resolve(token);
            return;
          }

          if (token.error === 'authorization_pending') {
            // Continue polling
            if (progressCallback) {
              progressCallback({
                status: 'pending',
                message: 'Waiting for authorization...'
              });
            }
            setTimeout(poll, pollInterval * 1000);
          } else if (token.error === 'slow_down') {
            // Increase polling interval
            pollInterval += 5;
            if (progressCallback) {
              progressCallback({
                status: 'slow_down',
                message: 'Polling slowed down. Please authorize...'
              });
            }
            setTimeout(poll, pollInterval * 1000);
          } else if (token.error === 'expired_token') {
            reject(new Error('Device code expired. Please start a new authorization flow.'));
          } else if (token.error) {
            reject(new Error(token.error_description || token.error));
          } else {
            // Unexpected response - continue polling
            setTimeout(poll, pollInterval * 1000);
          }
        } catch (error) {
          reject(error);
        }
      };

      // Start polling
      poll();
    });
  }

  /**
   * Check token status
   */
  async checkTokenStatus() {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        client_id: this.clientId,
        device_code: this.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      });

      const options = {
        hostname: 'github.com',
        path: '/login/oauth/access_token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Synergy-Cyberix-Scanner'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve(response);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Get user information
   */
  async getUserInfo(accessToken) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: '/user',
        method: 'GET',
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Synergy-Cyberix-Scanner'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const user = JSON.parse(data);
              resolve(user);
            } else {
              reject(new Error(`Failed to get user info: ${res.statusCode} ${data}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.end();
    });
  }

  /**
   * Get all repositories accessible to the user
   */
  async getRepositories(accessToken, page = 1, perPage = 100) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/user/repos?page=${page}&per_page=${perPage}&sort=updated&affiliation=owner,collaborator,organization_member`,
        method: 'GET',
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Synergy-Cyberix-Scanner'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const repos = JSON.parse(data);
              const linkHeader = res.headers.link;
              
              // Check if there are more pages
              const hasNext = linkHeader && linkHeader.includes('rel="next"');
              
              resolve({
                repositories: repos,
                hasNext: !!hasNext,
                page: page
              });
            } else {
              reject(new Error(`Failed to get repositories: ${res.statusCode} ${data}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.end();
    });
  }

  /**
   * Get all repositories (all pages)
   */
  async getAllRepositories(accessToken, progressCallback = null) {
    const allRepos = [];
    let page = 1;
    let hasNext = true;

    while (hasNext) {
      if (progressCallback) {
        progressCallback({
          status: 'fetching',
          message: `Fetching repositories page ${page}...`,
          page: page
        });
      }

      const result = await this.getRepositories(accessToken, page);
      allRepos.push(...result.repositories);
      hasNext = result.hasNext;
      page++;
    }

    return allRepos;
  }
}

module.exports = GitHubOAuth;

