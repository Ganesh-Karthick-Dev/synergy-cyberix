import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Bot, User, RotateCcw } from 'lucide-react'
import { getSecurePassword } from '../utils/securePasswordStorage'

function ChatBot() {
  const [isOpen, setIsOpen] = useState(false)
  // Chat history is stored in component state (in-memory only)
  // It will be lost when the component unmounts or the page refreshes
  // Currently NOT persisted to localStorage or any other storage
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Initialize with greeting message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: Date.now(),
          text: "Hello! I'm Gans, your AI assistant. How can I help you today?",
          sender: 'bot',
          timestamp: new Date()
        }
      ])
    }
  }, [isOpen])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage = {
      id: Date.now(),
      text: inputValue.trim(),
      sender: 'user',
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)

    try {
      const password = getSecurePassword()
      if (!password) {
        throw new Error('WSL password not available. Please configure WSL credentials first.')
      }

      // Create a context-aware prompt for tgpt
      const contextPrompt = `You are Gans, a helpful AI assistant for a cybersecurity application called Cyberix. You help users with security-related questions, tool usage, troubleshooting, and general assistance.

User's question: ${userMessage.text}

Please provide a helpful, clear, and concise response. If the question is about cybersecurity, security scanning, or the application features, provide detailed and accurate information. Be friendly and professional.`

      // Call tgpt API
      const result = await window.cyberGuard?.convertWithTgpt?.(contextPrompt, password)

      if (result && result.success) {
        let botResponse = result.output || result.stdout || ''
        
        // Clean the response - remove spinner characters and loading text
        // Remove patterns like "⣾  Loading" or any spinner character followed by "Loading"
        // Match spinner character followed by optional whitespace and "Loading" (case insensitive)
        botResponse = botResponse.replace(/[⣾⣽⣻⢿⡿⣟⣯⣷]\s*Loading\s*/gi, '')
        
        // Remove standalone spinner characters (Unicode spinner characters)
        botResponse = botResponse.replace(/[⣾⣽⣻⢿⡿⣟⣯⣷]/g, '')
        
        // Remove "Loading" text that appears on its own line (likely from spinner output)
        // This matches "Loading" at the start of a line or after whitespace, followed by newline or end
        botResponse = botResponse.replace(/^\s*Loading\s*$/gmi, '')
        botResponse = botResponse.replace(/\n\s*Loading\s*\n/gmi, '\n')
        
        // Remove markdown code blocks if present
        botResponse = botResponse.trim()
        botResponse = botResponse.replace(/^```(?:json|markdown)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '')
        
        // Clean up multiple newlines and extra whitespace
        botResponse = botResponse.replace(/\n{3,}/g, '\n\n')
        botResponse = botResponse.trim()

        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            text: botResponse || "I apologize, but I couldn't generate a response. Please try again.",
            sender: 'bot',
            timestamp: new Date()
          }
        ])
      } else {
        throw new Error(result?.error || 'Failed to get response from AI')
      }
    } catch (error) {
      console.error('ChatBot error:', error)
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          text: `I'm sorry, I encountered an error: ${error.message}. Please make sure WSL is configured and tgpt is installed.`,
          sender: 'bot',
          timestamp: new Date()
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleClose = () => {
    setIsOpen(false)
  }

  const handleClearChat = () => {
    // Clear all messages and reset to initial greeting
    setMessages([
      {
        id: Date.now(),
        text: "Hello! I'm Gans, your AI assistant. How can I help you today?",
        sender: 'bot',
        timestamp: new Date()
      }
    ])
  }

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg hover:shadow-xl transform transition-all duration-300 hover:scale-110 flex items-center justify-center ${
          isOpen ? 'rotate-45' : 'rotate-0'
        }`}
        aria-label="Open chat with Gans"
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageCircle className="w-6 h-6" />
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-40 w-96 max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-8rem)] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col animate-slide-up">
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Gans</h3>
                <p className="text-xs text-white/80">AI Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearChat}
                className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
                aria-label="Clear chat history"
                title="Clear chat"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
                aria-label="Close chat"
                title="Close chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-slate-900">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.sender === 'bot' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    message.sender === 'user'
                      ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-br-sm'
                      : 'bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 rounded-bl-sm border border-gray-200 dark:border-slate-600'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {message.text}
                  </p>
                  <p className="text-xs mt-1.5 opacity-70">
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                {message.sender === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-white" />
                  </div>
                )}
              </div>
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="bg-white dark:bg-slate-700 rounded-2xl rounded-bl-sm px-4 py-2.5 border border-gray-200 dark:border-slate-600">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-2xl">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading}
                className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                aria-label="Send message"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </>
  )
}

export default ChatBot

