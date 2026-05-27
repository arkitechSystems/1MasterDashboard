import React, { useState, useRef, useEffect } from 'react';
import { prepareFinancialContext } from '../utils/aiDataContext';
import { getApiUrl, API_ENDPOINTS } from '../config';
import { assignTxIds } from '../services/glTransactions';

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

  const getAIResponse = async (userMessage: string): Promise<string> => {
    try {
      // Prepare financial context based on the question
      let financialContext = '';
      if (gldetData.length > 0) {
        financialContext = prepareFinancialContext(userMessage, gldetData);
        console.log('Sending financial context to AI:', financialContext.substring(0, 200) + '...');
      }

      const response = await fetch(getApiUrl('/ask'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: userMessage,
          financialContext: financialContext
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response from AI');
      }

      return data.answer;
    } catch (error) {
      console.error('Error calling AI:', error);
      return 'Sorry, I encountered an error while processing your question. Please make sure the backend server is running and try again.';
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText.trim(),
      isUser: true,
      timestamp: new Date()
    };

    const userQuestion = inputText.trim();
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    // Get real AI response from OpenAI via backend
    const aiResponseText = await getAIResponse(userQuestion);

    const aiResponse: Message = {
      id: (Date.now() + 1).toString(),
      text: aiResponseText,
      isUser: false,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, aiResponse]);
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