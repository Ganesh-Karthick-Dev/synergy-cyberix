<<<<<<< HEAD
import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Bot, User, RotateCcw, Volume2, VolumeX, Mic, MicOff } from 'lucide-react'
import { getSecurePassword } from '../utils/securePasswordStorage'

function ChatBot() {
  const [isOpen, setIsOpen] = useState(false)
  // Chat history is stored in component state (in-memory only)
  // It will be lost when the component unmounts or the page refreshes
  // Currently NOT persisted to localStorage or any other storage
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [speechEnabled, setSpeechEnabled] = useState(true)
  const [isSpeechRecognitionSupported, setIsSpeechRecognitionSupported] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const speechSynthesisRef = useRef(null)
  const currentUtteranceRef = useRef(null)
  const recognitionRef = useRef(null)
  const isManuallyStoppedRef = useRef(false)
  const recognitionTimeoutRef = useRef(null)
  const lastProcessedIndexRef = useRef(-1)
  const interimTranscriptRef = useRef('')
  const initialInputValueRef = useRef('')

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

  // Debug: Log input value changes
  useEffect(() => {
    console.log('🎤 [DEBUG] Input value changed:', inputValue)
    // Force update the input element's value directly as a fallback
    if (inputRef.current && inputRef.current.value !== inputValue) {
      inputRef.current.value = inputValue
    }
  }, [inputValue])

  // Initialize Speech Synthesis
  useEffect(() => {
    // Check if browser supports Speech Synthesis
    if ('speechSynthesis' in window) {
      speechSynthesisRef.current = window.speechSynthesis
      
      // Get available voices
      const loadVoices = () => {
        const voices = speechSynthesisRef.current.getVoices()
        console.log('Available voices:', voices.length)
      }
      
      // Some browsers load voices asynchronously
      if (speechSynthesisRef.current.getVoices().length > 0) {
        loadVoices()
      }
      speechSynthesisRef.current.onvoiceschanged = loadVoices
    } else {
      console.warn('Speech synthesis not supported in this browser')
    }

    return () => {
      // Stop any ongoing speech when component unmounts
      if (speechSynthesisRef.current && speechSynthesisRef.current.speaking) {
        speechSynthesisRef.current.cancel()
      }
    }
  }, [])

  // Initialize Speech Recognition (Voice Input)
  useEffect(() => {
    // Check if browser supports Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    
    if (SpeechRecognition) {
      setIsSpeechRecognitionSupported(true)
      const recognition = new SpeechRecognition()
      recognition.continuous = true // Keep listening continuously
      recognition.interimResults = true // Show interim results for better UX
      recognition.lang = 'en-US'
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        console.log('🎤 [DEBUG] ===== onstart event fired =====')
        console.log('🎤 [DEBUG] Recognition object:', recognition)
        console.log('🎤 [DEBUG] Recognition state:', recognition.state)
        console.log('🎤 [DEBUG] Recognition config:', {
          continuous: recognition.continuous,
          interimResults: recognition.interimResults,
          lang: recognition.lang
        })
        
        setIsListening(true)
        isManuallyStoppedRef.current = false
        lastProcessedIndexRef.current = -1
        interimTranscriptRef.current = ''
        // Save the current input value when starting (in case we want to preserve it)
        initialInputValueRef.current = inputValue
        
        console.log('🎤 [DEBUG] Listening state set to true')
        console.log('🎤 [DEBUG] Initial input value:', initialInputValueRef.current)
        console.log('🎤 [DEBUG] Ready to receive speech input!')
      }

      recognition.onresult = (event) => {
        console.log('🎤 [DEBUG] Speech recognition result received', event)
        
        if (!event.results || event.results.length === 0) {
          console.log('🎤 [DEBUG] No results in event')
          return
        }
        
        let transcript = ''
        let interimTranscript = ''
        
        // Process all results - simpler approach
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i]
          if (!result || !result[0]) continue
          
          const resultText = result[0].transcript || ''
          if (!resultText.trim()) continue
          
          if (result.isFinal) {
            // Final results - add to permanent transcript
            transcript += resultText + ' '
          } else {
            // Interim results - show current interim
            interimTranscript += resultText + ' '
          }
        }
        
        // Trim and combine
        transcript = transcript.trim()
        interimTranscript = interimTranscript.trim()
        
        // Combine final and interim
        const fullText = transcript + (interimTranscript ? ' ' + interimTranscript : '')
        
        console.log('🎤 [DEBUG] Processing results:', {
          resultIndex: event.resultIndex,
          resultsLength: event.results.length,
          transcript,
          interimTranscript,
          fullText,
          rawResults: Array.from(event.results).map((r, i) => ({
            i,
            text: r[0]?.transcript || '',
            isFinal: r.isFinal
          }))
        })
        
        // Update the input value immediately
        if (fullText) {
          console.log('🎤 [DEBUG] Updating input with:', fullText)
          setInputValue(fullText)
          
          // Also force update the DOM element directly as backup
          if (inputRef.current) {
            inputRef.current.value = fullText
            console.log('🎤 [DEBUG] Forced DOM update, input value is now:', inputRef.current.value)
          }
        } else {
          console.log('🎤 [DEBUG] No text to update (empty transcript)')
        }
        
        // Store for reference
        interimTranscriptRef.current = interimTranscript
      }

      recognition.onerror = (event) => {
        console.error('🎤 [DEBUG] Speech recognition error:', event.error, event)
        
        // Only stop listening for critical errors, not for 'no-speech' or network errors
        let shouldStop = false
        let shouldShowError = false
        let errorMessage = ''
        let shouldLogError = true // Only log non-network, non-no-speech errors
        
        switch (event.error) {
          case 'no-speech':
            // Don't stop for no-speech - just keep listening (recognition will continue)
            shouldStop = false
            shouldShowError = false
            shouldLogError = false // Don't log no-speech errors
            console.log('🎤 [DEBUG] No speech detected (continuing to listen)')
            break
          case 'audio-capture':
            errorMessage = 'Microphone not found. Please check your microphone settings.'
            shouldStop = true
            shouldShowError = true
            isManuallyStoppedRef.current = true
            break
          case 'not-allowed':
            errorMessage = 'Microphone permission denied. Please allow microphone access in your browser settings.'
            shouldStop = true
            shouldShowError = true
            isManuallyStoppedRef.current = true
            break
          case 'network':
            // Network errors - completely ignore, don't try to restart, don't log
            // The recognition will continue or handle it automatically
            shouldStop = false
            shouldShowError = false
            shouldLogError = false // Don't log network errors
            console.log('🎤 [DEBUG] Network error (continuing to listen)')
            break
          case 'aborted':
            // Only stop if manually aborted
            shouldStop = isManuallyStoppedRef.current
            shouldShowError = false
            shouldLogError = false // Don't log aborted errors
            console.log('🎤 [DEBUG] Recognition aborted (manually stopped:', isManuallyStoppedRef.current, ')')
            // Don't try to restart on abort - let onend handle it
            break
          case 'service-not-allowed':
            errorMessage = 'Speech recognition service is not allowed. This may be a network or security policy restriction.'
            shouldStop = true
            shouldShowError = true
            isManuallyStoppedRef.current = true
            break
          default:
            // For unknown errors, only stop if it's not network-related
            const isNetworkIssue = event.error.includes('network') || event.error.includes('connection')
            if (!isNetworkIssue) {
              errorMessage = `Speech recognition error: ${event.error}. Please check your microphone permissions.`
              shouldStop = true
              shouldShowError = true
              isManuallyStoppedRef.current = true
            } else {
              // Network-related errors - silently continue
              shouldStop = false
              shouldLogError = false // Don't log network-related errors
            }
        }
        
        // Only log errors that we care about (not network, no-speech, or aborted)
        if (shouldLogError) {
          console.error('🎤 [DEBUG] Critical speech recognition error:', event.error, event)
        }
        
        if (shouldStop) {
          console.log('🎤 [DEBUG] Stopping recognition due to error')
          setIsListening(false)
        }
        
        if (shouldShowError) {
          setMessages(prev => [
            ...prev,
            {
              id: Date.now(),
              text: errorMessage,
              sender: 'bot',
              timestamp: new Date()
            }
          ])
        }
      }

      recognition.onend = () => {
        console.log('🎤 [DEBUG] Speech recognition onend event fired')
        console.log('🎤 [DEBUG] Manually stopped:', isManuallyStoppedRef.current)
        
        // When recognition ends, finalize any interim text
        if (interimTranscriptRef.current) {
          setInputValue(prev => {
            // Remove the interim text and add it as final (if it's at the end)
            const withoutInterim = prev.replace(new RegExp(interimTranscriptRef.current.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), '').trim()
            const finalValue = withoutInterim + (withoutInterim ? ' ' : '') + interimTranscriptRef.current.trim()
            interimTranscriptRef.current = ''
            return finalValue
          })
        }
        
        // Check if state property exists (it might not in all browsers)
        const hasStateProperty = recognitionRef.current && 'state' in recognitionRef.current
        const currentState = hasStateProperty ? recognitionRef.current.state : 'unknown'
        console.log('🎤 [DEBUG] Recognition state:', currentState, '(hasStateProperty:', hasStateProperty, ')')
        
        // Only restart if not manually stopped
        if (!isManuallyStoppedRef.current && recognitionRef.current) {
          console.log('🎤 [DEBUG] Attempting to restart recognition...')
          // Use a longer delay to ensure the recognition is fully stopped
          setTimeout(() => {
            if (!isManuallyStoppedRef.current && recognitionRef.current) {
              try {
                // Try to start - don't rely on state property as it might not exist
                console.log('🎤 [DEBUG] Attempting to start recognition...')
                recognitionRef.current.start()
                console.log('🎤 [DEBUG] Recognition restarted successfully')
              } catch (startError) {
                // Handle "already started" errors gracefully - this means it's already running
                if (startError.message && (startError.message.includes('already started') || startError.message.includes('not started'))) {
                  console.log('🎤 [DEBUG] Recognition already started (this is fine, continuing to listen)')
                  // Keep listening state true since it's already running
                  setIsListening(true)
                } else {
                  // For other errors, log them but try to continue
                  console.error('🎤 [DEBUG] Error restarting recognition:', startError)
                  // Don't stop listening on error - let it try to recover
                }
              }
            } else {
              console.log('🎤 [DEBUG] Not restarting - manually stopped or recognition ref is null')
            }
          }, 100) // Shorter delay for faster restart
        } else {
          console.log('🎤 [DEBUG] Recognition stopped manually, not restarting')
          setIsListening(false)
          // Reset tracking when manually stopped
          lastProcessedIndexRef.current = -1
          interimTranscriptRef.current = ''
        }
      }

      recognitionRef.current = recognition
      console.log('🎤 [DEBUG] Speech recognition initialized and stored in ref:', {
        continuous: recognition.continuous,
        interimResults: recognition.interimResults,
        lang: recognition.lang,
        refExists: !!recognitionRef.current
      })
    } else {
      setIsSpeechRecognitionSupported(false)
      console.warn('🎤 [DEBUG] Speech recognition not supported in this browser')
    }

    return () => {
      if (recognitionRef.current) {
        try {
          isManuallyStoppedRef.current = true
          recognitionRef.current.stop()
        } catch (e) {
          // Ignore errors on cleanup
        }
      }
      if (recognitionTimeoutRef.current) {
        clearTimeout(recognitionTimeoutRef.current)
      }
    }
  }, [])

  // Function to speak text
  const speakText = (text) => {
    if (!speechEnabled || !speechSynthesisRef.current) return
    
    // Stop any ongoing speech
    if (speechSynthesisRef.current.speaking) {
      speechSynthesisRef.current.cancel()
    }
    
    // Clean text - remove markdown, special characters, etc.
    const cleanText = text
      .replace(/[#*_`]/g, '') // Remove markdown
      .replace(/\n+/g, '. ') // Replace newlines with periods
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
    
    if (!cleanText) return
    
    const utterance = new SpeechSynthesisUtterance(cleanText)
    
    // Set voice properties
    const voices = speechSynthesisRef.current.getVoices()
    // Try to find a natural-sounding English voice
    const preferredVoice = voices.find(voice => 
      voice.lang.startsWith('en') && 
      (voice.name.includes('Natural') || voice.name.includes('Neural') || voice.name.includes('Premium'))
    ) || voices.find(voice => voice.lang.startsWith('en-US')) || voices.find(voice => voice.lang.startsWith('en'))
    
    if (preferredVoice) {
      utterance.voice = preferredVoice
    }
    
    utterance.rate = 1.0 // Normal speed
    utterance.pitch = 1.0 // Normal pitch
    utterance.volume = 1.0 // Full volume
    utterance.lang = 'en-US'
    
    utterance.onstart = () => {
      setIsSpeaking(true)
      console.log('Speech synthesis started')
    }
    
    utterance.onend = () => {
      setIsSpeaking(false)
      currentUtteranceRef.current = null
      console.log('Speech synthesis ended')
    }
    
    utterance.onerror = (event) => {
      setIsSpeaking(false)
      currentUtteranceRef.current = null
      console.error('Speech synthesis error:', event.error)
      // Don't show error to user - just log it
    }
    
    currentUtteranceRef.current = utterance
    speechSynthesisRef.current.speak(utterance)
  }

  // Stop speaking
  const stopSpeaking = () => {
    if (speechSynthesisRef.current && speechSynthesisRef.current.speaking) {
      speechSynthesisRef.current.cancel()
      setIsSpeaking(false)
      currentUtteranceRef.current = null
    }
  }

  // Toggle speech on/off
  const toggleSpeech = () => {
    if (isSpeaking) {
      stopSpeaking()
    }
    setSpeechEnabled(prev => !prev)
  }

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

        const botMessage = {
          id: Date.now() + 1,
          text: botResponse || "I apologize, but I couldn't generate a response. Please try again.",
          sender: 'bot',
          timestamp: new Date()
        }
        
        setMessages(prev => [...prev, botMessage])
        
        // Speak the bot's response if speech is enabled
        if (speechEnabled && botMessage.text) {
          // Small delay to ensure message is rendered
          setTimeout(() => {
            speakText(botMessage.text)
          }, 300)
        }
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

  const handleToggleListening = () => {
    console.log('🎤 [DEBUG] handleToggleListening called, isListening:', isListening)
    
    if (!recognitionRef.current) {
      console.log('🎤 [DEBUG] Recognition ref is null')
      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          text: 'Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.',
          sender: 'bot',
          timestamp: new Date()
        }
      ])
      return
    }

    if (isListening) {
      // Stop listening manually
      try {
        console.log('🎤 [DEBUG] Stopping recognition manually...')
        console.log('🎤 [DEBUG] Current recognition state:', recognitionRef.current.state)
        isManuallyStoppedRef.current = true
        recognitionRef.current.stop()
        setIsListening(false)
        console.log('🎤 [DEBUG] Speech recognition stopped manually')
      } catch (error) {
        console.error('🎤 [DEBUG] Error stopping speech recognition:', error)
        setIsListening(false)
        isManuallyStoppedRef.current = true
      }
    } else {
      // Start listening
      console.log('🎤 [DEBUG] Starting recognition manually...')
      console.log('🎤 [DEBUG] Recognition ref exists:', !!recognitionRef.current)
      
      if (!recognitionRef.current) {
        console.error('🎤 [DEBUG] Cannot start - recognition ref is null!')
        setMessages(prev => [
          ...prev,
          {
            id: Date.now(),
            text: 'Speech recognition is not available. Please refresh the page and try again.',
            sender: 'bot',
            timestamp: new Date()
          }
        ])
        return
      }
      
      isManuallyStoppedRef.current = false
      
      // Reset tracking
      lastProcessedIndexRef.current = -1
      interimTranscriptRef.current = ''
      initialInputValueRef.current = inputValue
      
      // Don't clear input - let user decide or let speech recognition replace it
      
      // Simple start - try to stop first, then start
      const startRecognition = () => {
        try {
          // Try to stop any existing recognition first
          try {
            if (recognitionRef.current) {
              recognitionRef.current.stop()
              console.log('🎤 [DEBUG] Stopped any existing recognition')
            }
          } catch (e) {
            console.log('🎤 [DEBUG] Stop error (ignoring):', e)
            // Ignore stop errors
          }
          
          // Wait a bit longer to ensure cleanup, then start
          setTimeout(() => {
            if (!recognitionRef.current) {
              console.error('🎤 [DEBUG] Recognition ref became null before start!')
              setIsListening(false)
              return
            }
            
            try {
              console.log('🎤 [DEBUG] Attempting to start recognition...')
              console.log('🎤 [DEBUG] Recognition object:', {
                continuous: recognitionRef.current.continuous,
                interimResults: recognitionRef.current.interimResults,
                lang: recognitionRef.current.lang
              })
              
              recognitionRef.current.start()
              console.log('🎤 [DEBUG] Recognition start() called successfully - waiting for onstart event...')
              console.log('🎤 [DEBUG] If onstart does not fire within 2 seconds, there may be an issue')
              
            } catch (startError) {
              console.error('🎤 [DEBUG] Error starting recognition:', startError)
              
              // Check error type
              const errorMsg = startError.message || startError.toString() || String(startError)
              console.log('🎤 [DEBUG] Error message:', errorMsg)
              
              if (errorMsg.includes('already started') || errorMsg.includes('started') || errorMsg.includes('recognitionstart')) {
                console.log('🎤 [DEBUG] Recognition already started - this is OK, setting listening state')
                setIsListening(true)
              } else if (errorMsg.includes('permission') || errorMsg.includes('not-allowed') || errorMsg.includes('notallowed')) {
                setIsListening(false)
                isManuallyStoppedRef.current = true
                setMessages(prev => [
                  ...prev,
                  {
                    id: Date.now(),
                    text: 'Microphone permission denied. Please allow microphone access in your browser settings and try again.',
                    sender: 'bot',
                    timestamp: new Date()
                  }
                ])
              } else {
                setIsListening(false)
                isManuallyStoppedRef.current = true
                console.error('🎤 [DEBUG] Unknown error starting recognition:', startError)
                setMessages(prev => [
                  ...prev,
                  {
                    id: Date.now(),
                    text: `Failed to start speech recognition: ${errorMsg}. Please check your microphone and try again.`,
                    sender: 'bot',
                    timestamp: new Date()
                  }
                ])
              }
            }
          }, 100) // Increased delay for better cleanup
        } catch (error) {
          console.error('🎤 [DEBUG] Fatal error in startRecognition:', error)
          setIsListening(false)
          isManuallyStoppedRef.current = true
        }
      }
      
      startRecognition()
    }
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
              {('speechSynthesis' in window) && (
                <button
                  onClick={toggleSpeech}
                  className={`w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors ${
                    isSpeaking ? 'bg-white/30' : ''
                  }`}
                  aria-label={speechEnabled ? 'Disable speech' : 'Enable speech'}
                  title={speechEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech'}
                >
                  {speechEnabled ? (
                    <Volume2 className="w-4 h-4" />
                  ) : (
                    <VolumeX className="w-4 h-4" />
                  )}
                </button>
              )}
              {isSpeechRecognitionSupported && (
                <button
                  onClick={handleToggleListening}
                  className={`w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors ${
                    isListening ? 'bg-white/30 animate-pulse' : ''
                  }`}
                  aria-label={isListening ? 'Stop listening' : 'Start voice input'}
                  title={isListening ? 'Stop listening' : 'Start voice input'}
                >
                  {isListening ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>
              )}
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
                onChange={(e) => {
                  if (!isListening) {
                    setInputValue(e.target.value)
                  }
                }}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                readOnly={isListening}
                disabled={isLoading || isSpeaking}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {isSpeechRecognitionSupported && (
                <button
                  onClick={handleToggleListening}
                  disabled={isLoading || isSpeaking}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 ${
                    isListening
                      ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                      : 'bg-gray-200 dark:bg-slate-600 hover:bg-gray-300 dark:hover:bg-slate-500 text-gray-700 dark:text-gray-200'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  aria-label={isListening ? 'Stop listening' : 'Start voice input'}
                  title={isListening ? 'Stop listening' : 'Start voice input'}
                >
                  {isListening ? (
                    <MicOff className="w-5 h-5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>
              )}
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading || isSpeaking || isListening}
                className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                aria-label="Send message"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
              {isSpeaking ? (
                <span className="text-orange-500 dark:text-orange-400 font-medium">Speaking response...</span>
              ) : isListening ? (
                <span className="text-red-500 dark:text-red-400 font-medium">Listening... Speak now</span>
              ) : (
                <>
                  Press Enter to send, Shift+Enter for new line
                  {('speechSynthesis' in window) && speechEnabled && ' • Bot will speak responses'}
                  {isSpeechRecognitionSupported && ' • Click mic for voice input'}
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </>
  )
}

export default ChatBot

=======
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

>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
