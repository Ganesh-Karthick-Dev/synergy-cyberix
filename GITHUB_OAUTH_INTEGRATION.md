# GitHub OAuth Integration - Frontend Implementation

## Overview
GitHub OAuth login has been integrated into the frontend using the backend API endpoints. The integration allows users to authenticate with GitHub and access their repositories for API scanning.

## What Was Changed

### 1. **authApi.js** - Added GitHub OAuth Methods
- Added `loginWithGitHub()` method to initiate GitHub OAuth login
- Added `checkGitHubAuth()` method to check authentication status after OAuth callback
- Both methods use the backend API endpoints

### 2. **APIScanner.jsx** - Updated to Use Backend API
- Updated `handleInitiateAuth()` to use `authApi.loginWithGitHub()` instead of custom OAuth flow
- Added `useEffect` hook to check authentication status on component mount
- Updated `handleLogout()` to use `authApi.logout()` to clear backend cookies

### 3. **api.js** - Added Cookie Support
- Added `withCredentials: true` to axios instance to include cookies in requests
- This is required for the backend to read authentication cookies

## How It Works

### OAuth Flow

1. **User clicks "Sign in with GitHub"**
   - Frontend calls `authApi.loginWithGitHub()`
   - Redirects to: `http://localhost:9000/api/auth/github?redirect=/current-page`

2. **Backend handles OAuth**
   - Backend redirects to GitHub OAuth page
   - User authorizes on GitHub
   - GitHub redirects to: `http://localhost:9000/api/auth/github/callback?code=...`

3. **Backend processes callback**
   - Backend exchanges code for access token
   - Creates/updates user in database
   - Generates JWT tokens
   - Sets authentication cookies
   - Redirects to frontend

4. **Frontend checks authentication**
   - On page load, `useEffect` calls `authApi.checkGitHubAuth()`
   - Checks if user is authenticated via cookies
   - If authenticated, shows user profile and repositories

## API Endpoints Used

### Backend Endpoints
- `GET /api/auth/github` - Initiate GitHub OAuth login
- `GET /api/auth/github/callback` - Handle OAuth callback (automatic)
- `GET /api/auth/profile` - Get user profile (requires authentication)
- `POST /api/auth/logout` - Logout user (requires authentication)

## Environment Variables Required

Make sure these are set in your `.env` file:

```env
# Backend API URL
VITE_API_BASE_URL=http://localhost:9000/api

# GitHub OAuth (configured in backend)
# These are set in the backend .env file:
# GITHUB_CLIENT_ID=your-github-client-id
# GITHUB_CLIENT_SECRET=your-github-client-secret
# GITHUB_CALLBACK_URL=http://localhost:9000/api/auth/github/callback
# FRONTEND_URL=http://localhost:3000
```

## Testing the Integration

### 1. Start Backend Server
```bash
cd synergy-cyberix-server
npm run dev
```

### 2. Start Frontend
```bash
cd synergy-cyberix
npm run dev
```

### 3. Test OAuth Flow
1. Navigate to the API Scanner page
2. Click "Sign in with GitHub"
3. You should be redirected to GitHub OAuth page
4. Authorize the application
5. You should be redirected back to the frontend
6. The page should show you're authenticated

## Important Notes

### Cookies
- The backend sets authentication cookies after successful OAuth login
- Cookies are HttpOnly and Secure in production
- Frontend includes cookies in requests using `withCredentials: true`

### Authentication Check
- The frontend checks authentication on component mount
- If authenticated, it shows the user profile
- If not authenticated, it shows the login button

### Logout
- Logout clears both backend cookies and local storage
- After logout, user needs to authenticate again

## Troubleshooting

### Issue: "GitHub OAuth is not configured"
**Solution:** Make sure the backend has GitHub OAuth configured in `.env`:
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_CALLBACK_URL`

### Issue: "Authentication failed"
**Solution:** 
1. Check backend logs for errors
2. Verify GitHub OAuth app settings match the callback URL
3. Make sure backend server is running

### Issue: "Not authenticated after login"
**Solution:**
1. Check browser DevTools → Application → Cookies
2. Verify cookies are set after OAuth callback
3. Check CORS settings in backend
4. Verify `withCredentials: true` is set in axios config

### Issue: CORS errors
**Solution:**
1. Make sure backend CORS is configured to allow frontend origin
2. Check that `withCredentials: true` is set in axios
3. Verify backend allows credentials in CORS config

## Next Steps

1. **Test the integration** - Follow the testing steps above
2. **Configure GitHub OAuth App** - If not already done:
   - Go to GitHub Settings → Developer settings → OAuth Apps
   - Create new OAuth App
   - Set Authorization callback URL: `http://localhost:9000/api/auth/github/callback`
   - Add Client ID and Secret to backend `.env`

3. **Update environment variables** - Make sure all required env vars are set

4. **Test repository access** - After authentication, test fetching repositories

## Files Modified

- `src/services/authApi.js` - Added GitHub OAuth methods
- `src/components/APIScanner.jsx` - Updated to use backend API
- `src/services/api.js` - Added cookie support

## Support

If you encounter any issues:
1. Check browser console for errors
2. Check backend logs
3. Verify environment variables
4. Test OAuth flow step by step

