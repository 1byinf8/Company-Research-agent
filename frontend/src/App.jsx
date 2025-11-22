import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000'
const WS_URL = 'ws://localhost:8000'

const generateSessionId = () => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

function App() {
  const [sessionId, setSessionId] = useState(generateSessionId)
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

  useEffect(() => {
    const connectWs = () => {
      const ws = new WebSocket(`${WS_URL}/ws/${sessionId}`)
      ws.onopen = () => console.log('Connected')
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        handleWsMessage(data)
      }
      ws.onclose = () => {
        console.log('Disconnected, reconnecting...')
        setTimeout(connectWs, 2000)
      }
      ws.onerror = (err) => console.error('WebSocket error:', err)
      wsRef.current = ws
    }
    connectWs()
    return () => wsRef.current?.close()
  }, [sessionId])

  const handleWsMessage = useCallback((data) => {
    switch (data.type) {
      case 'intent':
        break
        
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
        break
        
      case 'status':
        setProgress({ percent: data.progress, message: data.message })
        break
        
      case 'research_update':
        // Don't add system messages for research updates - just update progress
        break
        
      case 'conflicts':
        setMessages(prev => [
          ...prev,
          { 
            role: 'system', 
            content: `Found ${data.conflicts.length} conflicting data points in research`,
            conflicts: data.conflicts
          }
        ])
        break
        
      case 'plan_complete':
        setPlan(data.plan)
        setShowPlan(true)
        setMessages(prev => [
          ...prev,
          { role: 'system', content: 'Account plan generated successfully. View the plan panel for details.' }
        ])
        break
        
      case 'section_updated':
        setPlan(prev => ({...prev, [data.section]: data.content}))
        setEditingSection(null)
        break
        
      case 'error':
        setMessages(prev => [
          ...prev,
          { role: 'error', content: data.message }
        ])
        break
        
      case 'done':
        setIsLoading(false)
        setProgress(null)
        currentResponseRef.current = ''
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

  const resetSession = () => {
    setSessionId(generateSessionId())
    setMessages([])
    setPlan(null)
    setShowPlan(false)
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
          <button className="btn btn-secondary btn-sm" onClick={resetSession}>
            New Session
          </button>
        </div>
      </header>

      <div className="main-content">
        <div className={`chat-panel ${showPlan ? 'with-plan' : ''}`}>
          <div className="messages">
            {messages.length === 0 && (
              <div className="welcome">
                <h2>Company Research Assistant</h2>
                <p>Research companies and generate comprehensive account plans for sales and business development.</p>
                <div className="suggestions">
                  <button onClick={() => setInput('Research Stripe for enterprise sales')}>
                    Research Stripe
                  </button>
                  <button onClick={() => setInput('Help me research a tech company')}>
                    Get Started
                  </button>
                  <button onClick={() => setInput('Create an account plan for Notion')}>
                    Plan for Notion
                  </button>
                </div>
              </div>
            )}
            
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                <div className="avatar">
                  {msg.role === 'user' ? 'U' : msg.role === 'assistant' ? 'AI' : 'i'}
                </div>
                <div className="content">
                  {msg.content}
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
                    <div className="typing-indicator">
                      <div className="typing-dots">
                        <span></span><span></span><span></span>
                      </div>
                      <span>Processing</span>
                    </div>
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
              placeholder="Ask about a company or request research..."
              disabled={isLoading}
              rows={1}
            />
            <button onClick={sendMessage} disabled={isLoading || !input.trim()} className="send-btn">
              Send
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

function PlanSection({ title, sectionKey, data, onEdit, isEditing, editInput, setEditInput, onSubmitEdit, onCancelEdit }) {
  const renderValue = (value) => {
    if (Array.isArray(value)) {
      if (value.length === 0) return <em>No data available</em>
      return (
        <ul>
          {value.map((item, i) => (
            <li key={i}>{typeof item === 'object' ? JSON.stringify(item) : item}</li>
          ))}
        </ul>
      )
    }
    if (typeof value === 'object' && value !== null) {
      return Object.entries(value).map(([k, v]) => (
        <div key={k} className="nested-field">
          <strong>{k.replace(/_/g, ' ')}:</strong> {renderValue(v)}
        </div>
      ))
    }
    return value || <em>Not available</em>
  }

  return (
    <div className="plan-section">
      <div className="section-header">
        <h3>{title}</h3>
        <button className="edit-btn" onClick={() => onEdit(sectionKey)}>Edit</button>
      </div>
      
      {isEditing ? (
        <div className="edit-form">
          <textarea
            value={editInput}
            onChange={(e) => setEditInput(e.target.value)}
            placeholder="Describe what changes you want..."
          />
          <div className="edit-actions">
            <button className="btn btn-primary btn-sm" onClick={onSubmitEdit}>Update</button>
            <button className="btn btn-secondary btn-sm" onClick={onCancelEdit}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="section-content">
          {data && Object.entries(data).map(([key, value]) => (
            <div key={key} className="field">
              <span className="field-label">{key.replace(/_/g, ' ')}</span>
              <span className="field-value">{renderValue(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App