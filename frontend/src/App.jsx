import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000'
const WS_URL = 'ws://localhost:8000'

// --- Linkify Component (Same as before) ---
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
  
  const wsRef = useRef(null)
  const messagesEndRef = useRef(null)
  const currentResponseRef = useRef('')

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 1. Fetch Session List on Mount
  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_URL}/sessions`)
      if (res.ok) {
        const data = await res.json()
        setSessions(data)
        // If no session selected and we have sessions, select the most recent one
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

  // 2. Handle Session Switching (Load History)
  useEffect(() => {
    if (!sessionId) return

    const loadSessionData = async () => {
      setIsLoading(false) // Reset loading state on switch
      setPlan(null) // Clear current plan
      setShowPlan(false)
      
      try {
        // Fetch Message History
        const msgRes = await fetch(`${API_URL}/session/${sessionId}/messages`)
        if (msgRes.ok) {
          const history = await msgRes.json()
          // Map backend history to frontend format if needed
          setMessages(history)
        }

        // Fetch Plan (if exists)
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

    // Connect WebSocket
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
        await fetchSessions() // Refresh list
      }
    } catch (e) {
      console.error("Failed to create session", e)
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
        // Refresh session list names if a company was identified
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
        fetchSessions() // Update list to show company name
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

  // ... (handleKeyPress, handleEditSection, submitEdit remain same)
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

  // Helper to format date
  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch (e) { return '' }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-title">
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
        {/* Sidebar for Sessions */}
        <div className="sidebar">
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
                <div className="session-name">
                  {s.company || "New Research"}
                </div>
                <div className="session-meta">
                  <span>{formatDate(s.updated_at)}</span>
                  <span>{s.msg_count} msgs</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Chat Panel */}
        <div className={`chat-panel ${showPlan ? 'with-plan' : ''}`}>
          <div className="messages">
             {/* Welcome message only if truly empty session */}
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
                  <Linkify text={msg.content} />
                  {msg.conflicts && (
                    <ul style={{ marginTop: '0.5rem', paddingLeft: '1rem' }}>
                      {msg.conflicts.map((c, j) => (
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about a company..."
              disabled={isLoading}
              rows={1}
            />
            <button onClick={sendMessage} disabled={isLoading || !input.trim()} className="send-btn">Send</button>
          </div>
        </div>

        {/* Plan Panel (Same as before) */}
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

// ... (PlanSection component remains the same as previous valid version)
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