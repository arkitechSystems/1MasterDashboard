import React, { useState, useRef, useEffect } from 'react';
import { prepareFinancialContext } from '../utils/aiDataContext';
import { API_ENDPOINTS } from '../config';
import { assignTxIds } from '../services/glTransactions';
import { askAi, AiMessage } from '../services/ai';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

interface AIChatWindowProps {
  onClose: () => void;
}

const AIChatWindow: React.FC<AIChatWindowProps> = ({ onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hello! I\'m your AI financial analyst. I have access to your financial data and can help you analyze revenue, expenses, trends, and more. What would you like to know?',
      isUser: false,
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [gldetData, setGldetData] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load financial data on component mount
  useEffect(() => {
    const loadFinancialData = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (!token) {
          throw new Error('No authentication token found');
        }

        const response = await fetch(API_ENDPOINTS.GL_DATA, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to load data: ${response.status}`);
        }

        const data = assignTxIds(await response.json());
        setGldetData(data);
        console.log('Loaded financial data:', data.length, 'entries');
      } catch (error) {
        console.error('Error loading financial data:', error);
      }
    };

    loadFinancialData();
  }, []);

  // Build an AiMessage[] for the API: full conversation history (skipping the
  // canned greeting) plus the new user turn. The latest user message gets a
  // financial-data preamble injected; the system prompt itself stays frozen
  // server-side so prompt caching works across questions.
  const buildHistory = (
    priorMessages: Message[],
    newUserText: string,
  ): AiMessage[] => {
    let financialContext = '';
    if (gldetData.length > 0) {
      financialContext = prepareFinancialContext(newUserText, gldetData);
    }
    const enrichedUserText = financialContext
      ? `[Dashboard data context]\n${financialContext}\n\n[User question]\n${newUserText}`
      : newUserText;

    // Skip the greeting (id === '1') so the model doesn't see its own canned line.
    const history: AiMessage[] = priorMessages
      .filter((m) => m.id !== '1')
      .map((m) => ({
        role: m.isUser ? ('user' as const) : ('assistant' as const),
        content: m.text,
      }));
    history.push({ role: 'user', content: enrichedUserText });
    return history;
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const userQuestion = inputText.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      text: userQuestion,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    let aiResponseText: string;
    try {
      const wireMessages = buildHistory(messages, userQuestion);
      const res = await askAi(wireMessages);
      aiResponseText = res.content || '(no response)';
      if (res.usage) {
        console.log('[Ask AI usage]', res.usage);
      }
    } catch (err: any) {
      if (err?.status === 503) {
        aiResponseText =
          'Ask AI isn’t available yet — the backend doesn’t have ANTHROPIC_API_KEY configured. Add the key to the Render web service env vars and redeploy.';
      } else if (err?.status === 429) {
        aiResponseText =
          'Rate limited by the Claude API. Wait a moment and try again.';
      } else {
        aiResponseText = `Sorry, I hit an error: ${err?.message || 'unknown'}.`;
      }
    }

    const aiResponse: Message = {
      id: (Date.now() + 1).toString(),
      text: aiResponseText,
      isUser: false,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, aiResponse]);
    setIsTyping(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  if (isMinimized) {
    return (
      <div className="ai-chat-minimized">
        <button
          className="chat-restore-btn"
          onClick={() => setIsMinimized(false)}
        >
          <span className="material-symbols-outlined">text_fields_alt</span>
          <span>AI Assistant</span>
          <span className="minimize-icon material-icons">expand_more</span>
        </button>
      </div>
    );
  }

  return (
    <div className="ai-chat-window">
      <div className="chat-header">
        <div className="chat-title">
          <span className="material-symbols-outlined">text_fields_alt</span>
          <span>AI Financial Assistant</span>
        </div>
        <div className="chat-controls">
          <button
            className="chat-control-btn"
            onClick={() => setIsMinimized(true)}
            title="Minimize"
          >
            <span className="material-icons">minimize</span>
          </button>
          <button
            className="chat-control-btn"
            onClick={onClose}
            title="Close"
          >
            <span className="material-icons">close</span>
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.isUser ? 'user-message' : 'ai-message'}`}
          >
            <div className="message-content">
              <div className="message-text">
                {message.text.split('\n').map((line, index) => (
                  <div key={index}>{line}</div>
                ))}
              </div>
              <div className="message-time">
                {formatTime(message.timestamp)}
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="message ai-message">
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <div className="chat-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about your financial data..."
            className="chat-input"
            disabled={isTyping}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isTyping}
            className="send-button"
          >
            <span className="material-icons">send</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIChatWindow;