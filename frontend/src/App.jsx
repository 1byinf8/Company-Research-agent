import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000'
const WS_URL = 'ws://localhost:8000'

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
  
  const wsRef = useRef(null)
  const messagesEndRef = useRef(null)
  const currentResponseRef = useRef('')
  const inputRef = useRef(null)
  const recognitionRef = useRef(null) // --- NEW: Ref to control microphone ---

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Auto-focus input
  useEffect(() => {
    if (!isLoading && inputRef.current) {
        setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [sessionId, isLoading]);

  // --- 1. Voice to Text (STT) with Toggle ---
  const toggleListening = () => {
    // If already listening, stop it
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    // Check browser support
    if (!('webkitSpeechRecognition' in window)) {
      alert("Browser not supported for voice input. Please try Google Chrome.");
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? ' ' : '') + transcript);
    };

    recognitionRef.current = recognition; // Store instance
    recognition.start();
  };

  // --- 2. Text to Speech (TTS) ---
  const speakText = (text) => {
    if (!('speechSynthesis' in window)) {
        alert("Text-to-speech not supported in this browser.");
        return;
    }
    
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1; 
    utterance.pitch = 1;
    
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => voice.name.includes("Google US English")) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;

    window.speechSynthesis.speak(utterance);
  };

  // Fetch Session List
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

  // Handle Session Switching
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
        setPlan(prev => ({...prev, [data.section]: data.content}))
        setEditingSection(null)
        break
      case 'done':
        setIsLoading(false)
        setProgress(null)
        currentResponseRef.current = ''
        break
      case 'error':
        setMessages(prev => [...prev, { role: 'error', content: data.message }])
        setIsLoading(false)
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
        {/* Sidebar */}
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

        {/* Chat Panel */}
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
                    
                    {/* --- READ ALOUD BUTTON --- */}
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
              placeholder="Ask about a company..."
              disabled={isLoading}
              rows={1}
            />
            
            {/* --- MICROPHONE BUTTON (TOGGLES LISTENING) --- */}
            <button 
              onClick={toggleListening} 
              disabled={isLoading} 
              className={`btn-icon mic-btn ${isListening ? 'listening' : ''}`}
              title={isListening ? "Stop Listening" : "Voice Input"}
              style={{
                  marginRight: '8px', 
                  background: isListening ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                  color: isListening ? '#ef4444' : 'var(--text-muted)',
                  border: `1px solid ${isListening ? '#ef4444' : 'var(--border)'}`,
                  borderRadius: '8px',
                  padding: '0 12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: isListening ? 'bold' : 'normal'
              }}
            >
              {isListening ? '⏹' : '🎤'}
            </button>

            <button onClick={sendMessage} disabled={isLoading || !input.trim()} className="send-btn">Send</button>
          </div>
        </div>

        {/* Plan Panel */}
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
              />
              <PlanSection 
                title="Business Model" sectionKey="business_model" data={plan.business_model}
                onEdit={handleEditSection} isEditing={editingSection === 'business_model'}
                editInput={editInput} setEditInput={setEditInput}
                onSubmitEdit={submitEdit} onCancelEdit={() => setEditingSection(null)}
              />
              <PlanSection 
                title="Recent News" sectionKey="recent_news" data={plan.recent_news}
                onEdit={handleEditSection} isEditing={editingSection === 'recent_news'}
                editInput={editInput} setEditInput={setEditInput}
                onSubmitEdit={submitEdit} onCancelEdit={() => setEditingSection(null)}
              />
              <PlanSection 
                title="Leadership" sectionKey="leadership" data={plan.leadership}
                onEdit={handleEditSection} isEditing={editingSection === 'leadership'}
                editInput={editInput} setEditInput={setEditInput}
                onSubmitEdit={submitEdit} onCancelEdit={() => setEditingSection(null)}
              />
              <PlanSection 
                title="Market Position" sectionKey="market_position" data={plan.market_position}
                onEdit={handleEditSection} isEditing={editingSection === 'market_position'}
                editInput={editInput} setEditInput={setEditInput}
                onSubmitEdit={submitEdit} onCancelEdit={() => setEditingSection(null)}
              />
              <PlanSection 
                title="Financial Health" sectionKey="financial_health" data={plan.financial_health}
                onEdit={handleEditSection} isEditing={editingSection === 'financial_health'}
                editInput={editInput} setEditInput={setEditInput}
                onSubmitEdit={submitEdit} onCancelEdit={() => setEditingSection(null)}
              />
              <PlanSection 
                title="Pain Points" sectionKey="pain_points" data={plan.pain_points}
                onEdit={handleEditSection} isEditing={editingSection === 'pain_points'}
                editInput={editInput} setEditInput={setEditInput}
                onSubmitEdit={submitEdit} onCancelEdit={() => setEditingSection(null)}
              />
              <PlanSection 
                title="Engagement Strategy" sectionKey="engagement_strategy" data={plan.engagement_strategy}
                onEdit={handleEditSection} isEditing={editingSection === 'engagement_strategy'}
                editInput={editInput} setEditInput={setEditInput}
                onSubmitEdit={submitEdit} onCancelEdit={() => setEditingSection(null)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// PlanSection Component
function PlanSection({ title, sectionKey, data, onEdit, isEditing, editInput, setEditInput, onSubmitEdit, onCancelEdit }) {
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
        <button className="edit-btn" onClick={() => onEdit(sectionKey)}>Edit</button>
      </div>
      {isEditing ? (
        <div className="edit-form">
          <textarea value={editInput} onChange={(e) => setEditInput(e.target.value)} placeholder="Describe changes..." />
          <div className="edit-actions">
            <button className="btn btn-primary btn-sm" onClick={onSubmitEdit}>Update</button>
            <button className="btn btn-secondary btn-sm" onClick={onCancelEdit}>Cancel</button>
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