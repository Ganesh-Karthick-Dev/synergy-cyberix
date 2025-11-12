import React from 'react'
import React from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'

console.log('[MAIN.JSX] Starting application...')
console.log('[MAIN.JSX] Document ready state:', document.readyState)
console.log('[MAIN.JSX] Root element:', document.getElementById('root'))

// Wait for DOM to be ready
function initApp() {
  const rootElement = document.getElementById('root')
  
  if (!rootElement) {
    console.error('[MAIN.JSX] ❌ Root element not found!')
    document.body.innerHTML = `
      <div style="padding: 40px; color: red; font-family: 'Poppins', sans-serif; background: #1a1a1a; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="text-align: center;">
          <h1 style="color: #ff4444;">🚨 Critical Error</h1>
          <p>Root element (#root) not found in DOM</p>
          <p>This indicates a serious loading issue.</p>
          <button onclick="location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; margin-top: 20px;">🔄 Reload</button>
        </div>
      </div>
    `
    return
  }

  try {
    console.log('[MAIN.JSX] Creating React root...')
    const root = createRoot(rootElement)
    console.log('[MAIN.JSX] ✅ React root created successfully')
    
    console.log('[MAIN.JSX] Rendering application...')
    root.render(
      <StrictMode>
        <App />
        <Toaster position="top-center" />
      </StrictMode>
    )
    console.log('[MAIN.JSX] ✅ React app rendered successfully')
  } catch (error) {
    console.error('[MAIN.JSX] ❌ React mounting error:', error)
    console.error('[MAIN.JSX] Error stack:', error.stack)
    
    const errorDisplay = `
      <div style="padding: 40px; color: #fff; font-family: 'Poppins', sans-serif; background: #1a1a1a; min-height: 100vh;">
        <div style="max-width: 800px; margin: 0 auto;">
          <h1 style="color: #ff4444;">🚨 React Error</h1>
          <div style="background: #2a2a2a; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Error:</strong> ${error.message}</p>
            <pre style="background: #1a1a1a; padding: 15px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap;">${error.stack}</pre>
          </div>
          <button onclick="location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">🔄 Reload</button>
        </div>
      </div>
    `
    
    if (rootElement) {
      rootElement.innerHTML = errorDisplay
    } else {
      document.body.innerHTML = errorDisplay
    }
  }
}

// Global error handlers
window.addEventListener('error', (event) => {
  console.error('[MAIN.JSX] Global error:', event.error, event.message, event.filename, event.lineno)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('[MAIN.JSX] Unhandled promise rejection:', event.reason)
})

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp)
} else {
  // DOM is already ready
  initApp()
console.log('main.jsx loading...')

// Check if page body contains JSON response from OAuth callback (before React mounts)
const checkAndHandleJsonResponse = () => {
  try {
    // Multiple ways to detect JSON:
    // 1. Check body text directly
    const bodyText = document.body.innerText || document.body.textContent || '';
    // 2. Check if body HTML contains JSON
    const bodyHTML = document.body.innerHTML || '';
    // 3. Check for pre tags containing JSON
    const preElements = document.querySelectorAll('pre');
    
    let jsonText = '';
    
    // Try to find JSON in pre tags first
    if (preElements.length > 0) {
      for (const pre of preElements) {
        const preText = pre.textContent || pre.innerText || '';
        if (preText.trim().startsWith('{') && preText.includes('"success"')) {
          jsonText = preText.trim();
          break;
        }
      }
    }
    
    // If not found in pre tags, check body text
    if (!jsonText && bodyText.trim().startsWith('{') && bodyText.includes('"success"')) {
      jsonText = bodyText.trim();
    }
    
    // If still not found, check body HTML
    if (!jsonText && bodyHTML.trim().startsWith('{') && bodyHTML.includes('"success"')) {
      // Try to extract JSON from HTML
      const jsonMatch = bodyHTML.match(/\{[\s\S]*"success"[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }
    }
    
    // If we found JSON, process it
    if (jsonText && jsonText.length < 10000) {
      try {
        const jsonData = JSON.parse(jsonText);
        if (jsonData.success && jsonData.data) {
          console.log('📥 [main.jsx] Detected JSON OAuth response, storing and clearing body...');
          console.log('📥 [main.jsx] JSON data:', jsonData);
          
          // Store JSON data in sessionStorage for the component to read
          sessionStorage.setItem('oauth_callback_data', JSON.stringify(jsonData));
          
          // Clear the body completely and recreate root element
          document.body.innerHTML = '<div id="root"></div>';
          
          // Update URL to remove any callback parameters
          if (window.location.search.includes('code=') || window.location.search.includes('github_auth=')) {
            const url = new URL(window.location);
            url.searchParams.delete('code');
            url.searchParams.delete('github_auth');
            url.searchParams.delete('state');
            window.history.replaceState({}, '', url.toString());
          }
          
          return true; // JSON was handled
        }
      } catch (parseError) {
        console.error('Failed to parse JSON response:', parseError);
        console.error('JSON text that failed to parse:', jsonText.substring(0, 200));
      }
    }
  } catch (error) {
    console.error('Error checking for JSON response:', error);
  }
  return false;
};

// Handle JSON response before React mounts
// Also check after a short delay in case JSON loads after DOM is ready
let jsonHandled = checkAndHandleJsonResponse();
if (!jsonHandled) {
  // Check again after DOM is fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        jsonHandled = checkAndHandleJsonResponse();
        // If still not handled, check one more time after a longer delay
        if (!jsonHandled) {
          setTimeout(checkAndHandleJsonResponse, 500);
        }
      }, 100);
    });
  } else {
    setTimeout(() => {
      jsonHandled = checkAndHandleJsonResponse();
      // If still not handled, check one more time after a longer delay
      if (!jsonHandled) {
        setTimeout(checkAndHandleJsonResponse, 500);
      }
    }, 100);
  }
}

// Aggressive JSON clearing function that runs continuously
const aggressiveJsonClear = () => {
  try {
    // Check if body or root contains raw JSON text
    const bodyText = document.body?.innerText || document.body?.textContent || '';
    const root = document.getElementById('root');
    const rootText = root?.innerText || root?.textContent || '';
    
    // Check if we see JSON-like content
    const hasJson = (bodyText.trim().startsWith('{') && bodyText.includes('"success"')) ||
                    (rootText.trim().startsWith('{') && rootText.includes('"success"'));
    
    if (hasJson) {
      // Check if React has actually rendered (root should have children)
      const rootHasContent = root && root.children.length > 0;
      
      // If root has no React content, this is raw JSON
      if (!rootHasContent) {
        // Try to parse and store JSON
        const jsonText = bodyText.trim().startsWith('{') ? bodyText.trim() : rootText.trim();
        try {
          const jsonData = JSON.parse(jsonText);
          if (jsonData.success && jsonData.data) {
            console.log('📥 [main.jsx] Found raw JSON, storing and clearing...');
            sessionStorage.setItem('oauth_callback_data', JSON.stringify(jsonData));
            document.body.innerHTML = '<div id="root"></div>';
            return true;
          }
        } catch (e) {
          // Not valid JSON, just clear it
          if (!rootHasContent) {
            document.body.innerHTML = '<div id="root"></div>';
          }
        }
      } else {
        // React has rendered but JSON might still be visible
        // Look for text nodes containing JSON and remove them
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        
        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent || '';
          if (text.trim().startsWith('{') && text.includes('"success"') && text.length < 10000) {
            try {
              const jsonData = JSON.parse(text.trim());
              if (jsonData.success && jsonData.data) {
                console.log('📥 [main.jsx] Found JSON in text node, storing and removing...');
                sessionStorage.setItem('oauth_callback_data', JSON.stringify(jsonData));
                node.parentNode?.removeChild(node);
                return true;
              }
            } catch (e) {
              // Not valid JSON, remove the text node anyway
              node.parentNode?.removeChild(node);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in aggressive JSON clear:', error);
  }
  return false;
};

// Set up a mutation observer to catch JSON that appears after React mounts
if (typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(() => {
    aggressiveJsonClear();
  });
  
  // Start observing immediately
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    // Also run aggressive clear periodically
    const intervalId = setInterval(() => {
      if (aggressiveJsonClear()) {
        clearInterval(intervalId);
        observer.disconnect();
      }
    }, 100);
    
    // Stop after 10 seconds
    setTimeout(() => {
      clearInterval(intervalId);
      observer.disconnect();
    }, 10000);
  }
}

// Also run aggressive clear immediately and after delays
aggressiveJsonClear();
setTimeout(aggressiveJsonClear, 100);
setTimeout(aggressiveJsonClear, 500);
setTimeout(aggressiveJsonClear, 1000);

// Ensure root element exists
let rootElement = document.getElementById('root');
if (!rootElement) {
  console.log('Root element not found, creating it...');
  rootElement = document.createElement('div');
  rootElement.id = 'root';
  document.body.appendChild(rootElement);
}

console.log('Root element:', rootElement);

try {
  const root = createRoot(rootElement)
  console.log('React root created successfully')
  
  root.render(
    <StrictMode>
      <App />
      <Toaster position="top-center" />
    </StrictMode>
  )
  console.log('React app rendered successfully')
} catch (error) {
  console.error('React mounting error:', error)
  rootElement.innerHTML = `
    <div style="padding: 20px; color: red; font-family: 'Poppins', sans-serif;">
      <h1>React Error</h1>
      <p>${error.message}</p>
      <pre>${error.stack}</pre>
    </div>
  `
}
