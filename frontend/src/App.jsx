import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

const MicIcon = () => (
  <svg 
    width="20" 
    height="20" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" x2="12" y1="19" y2="22"/>
  </svg>
);

const StopIcon = () => (
  <svg 
    width="16" 
    height="16" 
    viewBox="0 0 24 24" 
    fill="currentColor"
  >
    <rect x="4" y="4" width="16" height="16" rx="2"/>
  </svg>
);

const SendIcon = () => (
  <svg 
    width="18" 
    height="18" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
// Auto-detect secure/insecure websocket protocol based on API URL
const WS_URL = API_URL.replace(/^http/, 'ws')

// --- Linkify Component ---
const Linkify = ({ text }) => {
  if (typeof text !== 'string') return text;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-light)', textDecoration: 'underline' }} onClick={(e) => e.stopPropagation()}>{part}</a>
        }
        return part;
      })}
    </>
  );
};

function App() {
  const [sessionId, setSessionId] = useState(null)
  const [sessions, setSessions] = useState([])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [plan, setPlan] = useState(null)
  const [showPlan, setShowPlan] = useState(false)
  const [editingSection, setEditingSection] = useState(null)
  const [editInput, setEditInput] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const [isEditLoading, setIsEditLoading] = useState(false) // NEW: Edit loading state
  
  const wsRef = useRef(null)
  const messagesEndRef = useRef(null)
  const currentResponseRef = useRef('')
  const inputRef = useRef(null)
  const recognitionRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isLoading && inputRef.current) {
        setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [sessionId, isLoading]);

  const toggleListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert("Speech recognition not supported. Please use Chrome, Edge, or Safari.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    let finalTranscriptBuffer = '';
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      console.log('🎤 Listening started');
      setIsListening(true);
      finalTranscriptBuffer = '';
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let newFinalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
          newFinalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (newFinalTranscript && newFinalTranscript !== finalTranscriptBuffer) {
        console.log('📝 Final transcript:', newFinalTranscript);
        finalTranscriptBuffer = newFinalTranscript;
        
        setInput(prev => {
          const trimmedPrev = prev.trim();
          const separator = trimmedPrev ? ' ' : '';
          return trimmedPrev + separator + newFinalTranscript.trim();
        });
      }

      if (interimTranscript) {
        console.log('💭 Interim:', interimTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech error:', event.error);
      
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone permission.');
      } else if (event.error === 'audio-capture') {
        alert('No microphone found. Please connect a microphone.');
      } else if (event.error === 'no-speech') {
        console.log('No speech detected');
      } else if (event.error === 'aborted') {
        console.log('Recognition aborted by user');
      }
      
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      console.log('🎤 Listening ended');
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      console.log('🎤 Recognition started');
    } catch (err) {
      console.error('Failed to start recognition:', err);
      setIsListening(false);
      recognitionRef.current = null;
    }
  };

  const speakText = (text) => {
    if (!('speechSynthesis' in window)) {
      alert("Text-to-speech not supported.");
      return;
    }
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1;
    
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes("Google US English")) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;

    window.speechSynthesis.speak(utterance);
  };

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_URL}/sessions`)
      if (res.ok) {
        const data = await res.json()
        setSessions(data)
        if (!sessionId && data.length > 0) {
          setSessionId(data[0].session_id)
        } else if (!sessionId) {
          createNewSession()
        }
      }
    } catch (e) {
      console.error("Failed to fetch sessions", e)
    }
  }

  useEffect(() => {
    fetchSessions()
  }, [])

  useEffect(() => {
    if (!sessionId) return

    const loadSessionData = async () => {
      setIsLoading(false)
      setPlan(null)
      setShowPlan(false)
      
      try {
        const msgRes = await fetch(`${API_URL}/session/${sessionId}/messages`)
        if (msgRes.ok) {
          const history = await msgRes.json()
          setMessages(history)
        }

        const planRes = await fetch(`${API_URL}/plan/${sessionId}`)
        if (planRes.ok) {
          const planData = await planRes.json()
          setPlan(planData)
        }
      } catch (e) {
        console.error("Error loading session data", e)
      }
    }

    loadSessionData()

    const ws = new WebSocket(`${WS_URL}/ws/${sessionId}`)
    ws.onopen = () => console.log('Connected to session', sessionId)
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      handleWsMessage(data)
    }
    ws.onclose = () => console.log('Disconnected')
    wsRef.current = ws

    return () => {
      ws.close()
    }
  }, [sessionId])

  const createNewSession = async () => {
    try {
      const res = await fetch(`${API_URL}/session`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setSessionId(data.session_id)
        await fetchSessions()
      }
    } catch (e) {
      console.error("Failed to create session", e)
    }
  }
  
  const deleteSession = async (e, idToDelete) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this session?")) return;
    
    try {
        const res = await fetch(`${API_URL}/session/${idToDelete}`, { method: 'DELETE' });
        if (res.ok) {
            setSessions(prev => prev.filter(s => s.session_id !== idToDelete));
            if (sessionId === idToDelete) {
                const remaining = sessions.filter(s => s.session_id !== idToDelete);
                if (remaining.length > 0) {
                    setSessionId(remaining[0].session_id);
                } else {
                    setSessionId(null);
                    setMessages([]);
                    setPlan(null);
                    createNewSession();
                }
            }
        }
    } catch (e) {
        console.error("Failed to delete session", e);
    }
  }

  const handleWsMessage = useCallback((data) => {
    switch (data.type) {
      case 'message':
        currentResponseRef.current += data.content
        setMessages(prev => {
          const newMsgs = [...prev]
          if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === 'assistant') {
            newMsgs[newMsgs.length - 1].content = currentResponseRef.current
          } else {
            newMsgs.push({ role: 'assistant', content: data.content })
          }
          return newMsgs
        })
        if (data.content.includes("Starting research on")) {
             fetchSessions() 
        }
        break
      case 'status':
        setProgress({ percent: data.progress, message: data.message })
        break
      case 'conflicts':
        setMessages(prev => [...prev, { role: 'system', content: 'Conflicts found', conflicts: data.conflicts }])
        break
      case 'plan_complete':
        setPlan(data.plan)
        setShowPlan(true)
        setMessages(prev => [...prev, { role: 'system', content: 'Plan generated.' }])
        fetchSessions()
        break
      case 'section_updated':
        // Update with full plan data
        if (data.full_plan) {
          setPlan(data.full_plan)
        } else {
          setPlan(prev => ({...prev, [data.section]: data.updated_content}))
        }
        setEditingSection(null)
        setIsEditLoading(false)
        
        // ✅ Keep message - backend now persists it too
        setMessages(prev => [...prev, { 
          role: 'system', 
          content: `Section "${data.section}" updated successfully.` 
        }])
        break
      case 'done':
        setIsLoading(false)
        setProgress(null)
        setIsEditLoading(false)
        currentResponseRef.current = ''
        break
      case 'error':
        setMessages(prev => [...prev, { role: 'error', content: data.message }])
        setIsLoading(false)
        setIsEditLoading(false)
        setEditingSection(null)
        break
    }
  }, [])

  const sendMessage = () => {
    if (!input.trim() || !wsRef.current) return
    setMessages(prev => [...prev, { role: 'user', content: input }])
    setIsLoading(true)
    currentResponseRef.current = ''
    wsRef.current.send(JSON.stringify({ type: 'message', content: input }))
    setInput('')
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleEditSection = (sectionKey) => {
    setEditingSection(sectionKey)
    setEditInput('')
  }

  const submitEdit = () => {
    if (!editInput.trim() || !wsRef.current) return
    setIsEditLoading(true) // NEW: Start loading
    wsRef.current.send(JSON.stringify({
      type: 'edit_section',
      section: editingSection,
      instructions: editInput
    }))
    setEditInput('')
  }

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch (e) { return '' }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-title">
          <button className="btn-icon toggle-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
          <div className="header-logo">CR</div>
          <h1>Company Research Assistant</h1>
        </div>
        <div className="header-actions">
          {plan && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowPlan(!showPlan)}>
              {showPlan ? 'Hide Plan' : 'View Plan'}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={createNewSession}>
            + New Session
          </button>
        </div>
      </header>

      <div className="main-content">
        <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-header">
            <h3>History</h3>
          </div>
          <div className="session-list">
            {sessions.map(s => (
              <div 
                key={s.session_id} 
                className={`session-item ${s.session_id === sessionId ? 'active' : ''}`}
                onClick={() => setSessionId(s.session_id)}
              >
                <div className="session-content-wrapper">
                    <div className="session-name">
                    {s.company || "New Research"}
                    </div>
                    <div className="session-meta">
                    <span>{formatDate(s.updated_at)}</span>
                    <span>{s.msg_count} msgs</span>
                    </div>
                </div>
                <button 
                    className="delete-session-btn"
                    onClick={(e) => deleteSession(e, s.session_id)}
                    title="Delete Session"
                >
                    ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className={`chat-panel ${showPlan ? 'with-plan' : ''}`}>
          <div className="messages">
             {messages.length === 0 && !isLoading && (
              <div className="welcome">
                <h2>Company Research Assistant</h2>
                <p>Research companies and generate comprehensive account plans.</p>
                <div className="suggestions">
                  <button onClick={() => setInput('Research Stripe for enterprise sales')}>Research Stripe</button>
                  <button onClick={() => setInput('Research OpenAI')}>Research OpenAI</button>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                <div className="avatar">
                  {msg.role === 'user' ? 'U' : msg.role === 'assistant' ? 'AI' : 'i'}
                </div>
                <div className="content">
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                    <div><Linkify text={msg.content} /></div>
                    
                    {msg.role === 'assistant' && (
                      <button 
                        className="btn-icon speak-btn" 
                        onClick={() => speakText(msg.content)}
                        title="Read aloud"
                        style={{marginLeft: '12px', opacity: 0.6, cursor: 'pointer', border: 'none', background: 'transparent', fontSize: '1rem'}}
                      >
                        🔊
                      </button>
                    )}
                  </div>

                  {(msg.conflicts || (msg.metadata && msg.metadata.conflicts)) && (
                    <ul style={{ marginTop: '0.5rem', paddingLeft: '1rem' }}>
                      {(msg.conflicts || msg.metadata.conflicts).map((c, j) => (
                        <li key={j} style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                          <strong>{c.topic}:</strong> {c.suggested_resolution}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="message assistant">
                <div className="avatar">AI</div>
                <div className="content">
                  {progress ? (
                    <div className="progress-indicator">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{width: `${progress.percent}%`}} />
                      </div>
                      <span>{progress.message}</span>
                    </div>
                  ) : (
                    <div className="typing-indicator"><span>.</span><span>.</span><span>.</span></div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="input-area">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about a company... (e.g., 'Research Stripe')"
              disabled={isLoading}
              rows={1}
            />
            
            <button 
              onClick={toggleListening} 
              disabled={isLoading} 
              className={`mic-btn ${isListening ? 'listening' : ''}`}
              title={isListening ? "Click to stop" : "Click to speak"}
              aria-label={isListening ? "Stop recording" : "Start voice input"}
            >
              <span className="mic-icon-wrapper">
                {isListening ? <StopIcon /> : <MicIcon />}
              </span>
              {isListening && <span className="recording-indicator"></span>}
            </button>

            <button 
              onClick={sendMessage} 
              disabled={isLoading || !input.trim()} 
              className="send-btn"
              title="Send message"
            >
              <SendIcon />
            </button>
          </div>
        </div>

        {showPlan && plan && (
          <div className="plan-panel">
            <div className="plan-header">
              <h2>Account Plan: {plan.company_name}</h2>
              <button className="btn-close" onClick={() => setShowPlan(false)}>×</button>
            </div>
            <div className="plan-content">
              <PlanSection 
                title="Company Overview" sectionKey="overview" data={plan.overview}
                onEdit={handleEditSection} isEditing={editingSection === 'overview'}
                editInput={editInput} setEditInput={setEditInput}
                onSubmitEdit={submitEdit} onCancelEdit={() => setEditingSection(null)}
                isLoading={isEditLoading && editingSection === 'overview'}
              />
              <PlanSection 
                title="Business Model" sectionKey="business_model" data={plan.business_model}
                onEdit={handleEditSection} isEditing={editingSection === 'business_model'}
                editInput={editInput} setEditInput={setEditInput}
                onSubmitEdit={submitEdit} onCancelEdit={() => setEditingSection(null)}
                isLoading={isEditLoading && editingSection === 'business_model'}
              />
              <PlanSection 
                title="Recent News" sectionKey="recent_news" data={plan.recent_news}
                onEdit={handleEditSection} isEditing={editingSection === 'recent_news'}
                editInput={editInput} setEditInput={setEditInput}
                onSubmitEdit={submitEdit} onCancelEdit={() => setEditingSection(null)}
                isLoading={isEditLoading && editingSection === 'recent_news'}
              />
              <PlanSection 
                title="Leadership" sectionKey="leadership" data={plan.leadership}
                onEdit={handleEditSection} isEditing={editingSection === 'leadership'}
                editInput={editInput} setEditInput={setEditInput}
                onSubmitEdit={submitEdit} onCancelEdit={() => setEditingSection(null)}
                isLoading={isEditLoading && editingSection === 'leadership'}
              />
              <PlanSection 
                title="Market Position" sectionKey="market_position" data={plan.market_position}
                onEdit={handleEditSection} isEditing={editingSection === 'market_position'}
                editInput={editInput} setEditInput={setEditInput}
                onSubmitEdit={submitEdit} onCancelEdit={() => setEditingSection(null)}
                isLoading={isEditLoading && editingSection === 'market_position'}
              />
              <PlanSection 
                title="Financial Health" sectionKey="financial_health" data={plan.financial_health}
                onEdit={handleEditSection} isEditing={editingSection === 'financial_health'}
                editInput={editInput} setEditInput={setEditInput}
                onSubmitEdit={submitEdit} onCancelEdit={() => setEditingSection(null)}
                isLoading={isEditLoading && editingSection === 'financial_health'}
              />
              <PlanSection 
                title="Pain Points" sectionKey="pain_points" data={plan.pain_points}
                onEdit={handleEditSection} isEditing={editingSection === 'pain_points'}
                editInput={editInput} setEditInput={setEditInput}
                onSubmitEdit={submitEdit} onCancelEdit={() => setEditingSection(null)}
                isLoading={isEditLoading && editingSection === 'pain_points'}
              />
              <PlanSection 
                title="Engagement Strategy" sectionKey="engagement_strategy" data={plan.engagement_strategy}
                onEdit={handleEditSection} isEditing={editingSection === 'engagement_strategy'}
                editInput={editInput} setEditInput={setEditInput}
                onSubmitEdit={submitEdit} onCancelEdit={() => setEditingSection(null)}
                isLoading={isEditLoading && editingSection === 'engagement_strategy'}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// PlanSection Component with Loading State
function PlanSection({ title, sectionKey, data, onEdit, isEditing, editInput, setEditInput, onSubmitEdit, onCancelEdit, isLoading }) {
  const renderTextWithLink = (text) => {
    if (typeof text === 'string' && (text.startsWith('http') || text.startsWith('www'))) {
      return <a href={text} target="_blank" rel="noopener noreferrer" style={{color: 'var(--primary-light)'}}>{text}</a>
    }
    return text
  }
  const renderObjectItem = (item) => {
    if (item.name && item.differentiator) return <span><strong>{item.name}</strong>: {item.differentiator}</span>
    if (item.title && item.summary) {
      return (
        <span>
          {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" style={{fontWeight: 'bold', color: 'inherit', textDecoration: 'underline'}}>{item.title}</a> : <strong>{item.title}</strong>}
          {item.date && <span style={{color: 'var(--text-muted)', fontSize: '0.9em', marginLeft: '8px'}}>({item.date})</span>}<br/>
          <span style={{display: 'block', marginTop: '4px'}}>{item.summary}</span>
          {item.source && <span style={{fontSize: '0.8em', color: 'var(--text-muted)'}}>Source: {item.source}</span>}
        </span>
      )
    }
    if (item.name && item.title) {
      return (
        <span>
          {item.linkedin_url ? <a href={item.linkedin_url} target="_blank" rel="noopener noreferrer" style={{fontWeight: 'bold', color: 'inherit'}}>{item.name}</a> : <strong>{item.name}</strong>}
          {' '}({item.title})
          {item.background && <><br/><span style={{fontSize: '0.9em', color: 'var(--text-secondary)'}}>{item.background}</span></>}
        </span>
      )
    }
    return JSON.stringify(item)
  }
  const renderValue = (value) => {
    if (Array.isArray(value)) {
      if (value.length === 0) return <em>No data available</em>
      return <ul style={{paddingLeft: '1.2rem'}}>{value.map((item, i) => <li key={i} style={{marginBottom: '0.5rem'}}>{typeof item === 'object' && item !== null ? renderObjectItem(item) : <Linkify text={item} />}</li>)}</ul>
    }
    if (typeof value === 'object' && value !== null) {
      return Object.entries(value).map(([k, v]) => <div key={k} className="nested-field"><strong>{k.replace(/_/g, ' ')}:</strong> {renderValue(v)}</div>)
    }
    return <Linkify text={value} /> || <em>Not available</em>
  }

  return (
    <div className="plan-section">
      <div className="section-header">
        <h3>{title}</h3>
        <button className="edit-btn" onClick={() => onEdit(sectionKey)} disabled={isLoading}>
          {isLoading ? 'Updating...' : 'Edit'}
        </button>
      </div>
      {isEditing ? (
        <div className="edit-form">
          <textarea 
            value={editInput} 
            onChange={(e) => setEditInput(e.target.value)} 
            placeholder="Describe changes..." 
            disabled={isLoading}
          />
          <div className="edit-actions">
            <button className="btn btn-primary btn-sm" onClick={onSubmitEdit} disabled={isLoading}>
              {isLoading ? 'Updating...' : 'Update'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onCancelEdit} disabled={isLoading}>
              Cancel
            </button>
          </div>
          {isLoading && (
            <div className="edit-loading">
              <div className="spinner"></div>
              <span>Updating section with AI...</span>
            </div>
          )}
        </div>
      ) : isLoading ? (
        <div className="section-content section-loading">
          <div className="skeleton-loader">
            <div className="skeleton-line"></div>
            <div className="skeleton-line short"></div>
            <div className="skeleton-line"></div>
            <div className="skeleton-line short"></div>
          </div>
        </div>
      ) : (
        <div className="section-content">
          {data && Object.entries(data).map(([key, value]) => <div key={key} className="field"><span className="field-label">{key.replace(/_/g, ' ')}</span><div className="field-value">{renderValue(value)}</div></div>)}
        </div>
      )}
    </div>
  )
}

export default App