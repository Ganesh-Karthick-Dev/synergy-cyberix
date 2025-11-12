# Backend OAuth Implementation Requirements

## Overview
This document outlines what the backend needs to implement for the GitHub OAuth flow to work correctly with the Electron app.

## Required Endpoints

### 1. `GET /api/github/auth`
**Purpose**: Initiate GitHub OAuth flow

**Query Parameters**:
- `redirect` (optional): Custom redirect URL for Electron app (e.g., `myapp://github-callback`)

**Expected Behavior**:
1. Construct GitHub OAuth URL with:
   - `client_id`: Your GitHub OAuth app client ID
   - `redirect_uri`: Your backend callback URL (e.g., `http://localhost:9000/api/github/callback`)
   - `scope`: `user:email,read:org,repo`
   - `response_type`: `code`
   - `state`: Optional state parameter for security
2. **Redirect** the user to GitHub's OAuth page:
   ```
   https://github.com/login/oauth/authorize?response_type=code&redirect_uri=...&scope=...&client_id=...
   ```

**Example Implementation**:
```javascript
app.get('/api/github/auth', (req, res) => {
  const redirect = req.query.redirect || 'myapp://github-callback';
  const state = generateState(); // Optional: generate random state
  const redirectUri = `${process.env.BASE_URL}/api/github/callback`;
  
  const githubAuthUrl = `https://github.com/login/oauth/authorize?` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=user:email,read:org,repo&` +
    `client_id=${process.env.GITHUB_CLIENT_ID}&` +
    `state=${state}`;
  
  // Store state and redirect URL in session/cache
  storeOAuthState(state, redirect);
  
  // Redirect to GitHub
  res.redirect(githubAuthUrl);
});
```

---

### 2. `GET /api/github/callback`
**Purpose**: Handle GitHub OAuth callback and exchange code for token

**Query Parameters** (from GitHub):
- `code`: Authorization code from GitHub
- `state`: State parameter (if used)
- `error`: Error code (if authorization failed)
- `error_description`: Error description (if authorization failed)

**Expected Behavior**:
1. **Validate** the authorization code and state (if used)
2. **Exchange** the code for an access token by calling GitHub's token endpoint:
   ```
   POST https://github.com/login/oauth/access_token
   {
     "client_id": "...",
     "client_secret": "...",
     "code": "...",
     "redirect_uri": "..."
   }
   ```
3. **Get user info** from GitHub API using the access token:
   ```
   GET https://api.github.com/user
   Authorization: token <access_token>
   ```
4. **Redirect** to the Electron app's custom protocol URL:
   - If `redirect` was stored: `myapp://github-callback?token=<access_token>&user=<user_json>`
   - Or: `myapp://github-callback?code=<code>` (if frontend exchanges code)

**Example Implementation**:
```javascript
app.get('/api/github/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  // Handle errors
  if (error) {
    const redirectUrl = getStoredRedirect(state) || 'myapp://github-callback';
    return res.redirect(`${redirectUrl}?error=${error}&error_description=${req.query.error_description || error}`);
  }
  
  try {
    // Exchange code for token
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: code,
      redirect_uri: `${process.env.BASE_URL}/api/github/callback`
    }, {
      headers: { 'Accept': 'application/json' }
    });
    
    const accessToken = tokenResponse.data.access_token;
    
    // Get user info
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { 'Authorization': `token ${accessToken}` }
    });
    
    const user = userResponse.data;
    
    // Get stored redirect URL
    const redirectUrl = getStoredRedirect(state) || 'myapp://github-callback';
    
    // Redirect to Electron app with token and user info
    const userJson = encodeURIComponent(JSON.stringify(user));
    res.redirect(`${redirectUrl}?token=${accessToken}&user=${userJson}`);
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    const redirectUrl = getStoredRedirect(state) || 'myapp://github-callback';
    res.redirect(`${redirectUrl}?error=token_exchange_failed&error_description=${error.message}`);
  }
});
```

---

### 3. Alternative: Return JSON Instead of Redirect
If you prefer the frontend to handle the code exchange, you can return JSON:

```javascript
app.get('/api/github/callback', async (req, res) => {
  const { code, error } = req.query;
  
  if (error) {
    return res.json({ success: false, error });
  }
  
  try {
    // Exchange code for token
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: code,
      redirect_uri: `${process.env.BASE_URL}/api/github/callback`
    }, {
      headers: { 'Accept': 'application/json' }
    });
    
    const accessToken = tokenResponse.data.access_token;
    
    // Get user info
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { 'Authorization': `token ${accessToken}` }
    });
    
    return res.json({
      success: true,
      data: {
        accessToken: accessToken,
        user: userResponse.data
      }
    });
    
  } catch (error) {
    return res.json({ success: false, error: error.message });
  }
});
```

Then redirect to: `myapp://github-callback?code=<code>` and let the frontend call `/api/github/callback` to exchange it.

---

## Important Configuration

### GitHub OAuth App Settings
In your GitHub OAuth app settings, set:
- **Authorization callback URL**: `http://localhost:9000/api/github/callback`
  - (Or your production URL: `https://yourdomain.com/api/github/callback`)

### Environment Variables
```env
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
BASE_URL=http://localhost:9000  # Or your production URL
```

---

## Flow Diagram

```
1. User clicks "Authenticate with GitHub"
   ↓
2. Frontend calls: GET /api/github/auth?redirect=myapp://github-callback
   ↓
3. Backend redirects to: https://github.com/login/oauth/authorize?...
   ↓
4. User authorizes on GitHub
   ↓
5. GitHub redirects to: GET /api/github/callback?code=...
   ↓
6. Backend exchanges code for token
   ↓
7. Backend redirects to: myapp://github-callback?token=...&user=...
   ↓
8. Electron app receives callback and stores token
```

---

## Testing

### Test the OAuth Flow:
1. Start your backend server
2. Open: `http://localhost:9000/api/github/auth?redirect=myapp://github-callback`
3. Should redirect to GitHub login
4. After authorization, should redirect back to `myapp://github-callback?token=...`

### Common Issues:
- **Redirect URI mismatch**: Make sure the callback URL in GitHub OAuth app matches exactly
- **CORS issues**: Ensure CORS is configured for your frontend domain
- **State validation**: If using state, make sure to validate it in the callback

---

## Notes

- The frontend code supports both token-based and code-based callbacks
- If you redirect with `token`, the frontend will use it directly
- If you redirect with `code`, the frontend will call `/api/github/callback` to exchange it
- The custom protocol `myapp://` must be registered in your Electron app's main process

