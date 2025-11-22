import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000'
const WS_URL = 'ws://localhost:8000'

// Generate unique session ID
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

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // WebSocket connection
  useEffect(() => {
    const connectWs = () => {
      const ws = new WebSocket(`${WS_URL}/ws/${sessionId}`)
      
      ws.onopen = () => console.log('WebSocket connected')
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        handleWsMessage(data)
      }
      
      ws.onclose = () => {
        console.log('WebSocket closed, reconnecting...')
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
        // Could show intent badge
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
        setMessages(prev => [
          ...prev,
          { role: 'system', content: `📊 ${data.section}: ${data.preview}` }
        ])
        break
        
      case 'conflicts':
        setMessages(prev => [
          ...prev,
          { 
            role: 'system', 
            content: `⚠️ Found ${data.conflicts.length} conflicts in research data`,
            conflicts: data.conflicts
          }
        ])
        break
        
      case 'plan_complete':
        setPlan(data.plan)
        setShowPlan(true)
        setMessages(prev => [
          ...prev,
          { role: 'system', content: '✅ Account plan generated! Click "View Plan" to see details.' }
        ])
        break
        
      case 'section_updated':
        setPlan(prev => ({...prev, [data.section]: data.content}))
        setEditingSection(null)
        break
        
      case 'error':
        setMessages(prev => [
          ...prev,
          { role: 'error', content: `❌ ${data.message}` }
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
    
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: input }])
    setIsLoading(true)
    currentResponseRef.current = ''
    
    // Send via WebSocket
    wsRef.current.send(JSON.stringify({
      type: 'message',
      content: input
    }))
    
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
      {/* Header */}
      <header className="header">
        <h1>🏢 Company Research Assistant</h1>
        <div className="header-actions">
          {plan && (
            <button 
              className="btn btn-primary"
              onClick={() => setShowPlan(!showPlan)}
            >
              {showPlan ? 'Hide Plan' : 'View Plan'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={resetSession}>
            New Session
          </button>
        </div>
      </header>

      <div className="main-content">
        {/* Chat Panel */}
        <div className={`chat-panel ${showPlan ? 'with-plan' : ''}`}>
          <div className="messages">
            {messages.length === 0 && (
              <div className="welcome">
                <h2>👋 Welcome!</h2>
                <p>I can help you research companies and create account plans.</p>
                <div className="suggestions">
                  <button onClick={() => setInput('Research Stripe for enterprise sales')}>
                    Research Stripe
                  </button>
                  <button onClick={() => setInput('I need to research a tech company')}>
                    Help me get started
                  </button>
                  <button onClick={() => setInput('Create an account plan for Notion')}>
                    Account plan for Notion
                  </button>
                </div>
              </div>
            )}
            
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                {msg.role === 'user' && <div className="avatar">👤</div>}
                {msg.role === 'assistant' && <div className="avatar">🤖</div>}
                {msg.role === 'system' && <div className="avatar">ℹ️</div>}
                {msg.role === 'error' && <div className="avatar">⚠️</div>}
                
                <div className="content">
                  {msg.content}
                  {msg.conflicts && (
                    <ul className="conflicts-list">
                      {msg.conflicts.map((c, j) => (
                        <li key={j}>
                          <strong>{c.topic}:</strong> {c.suggested_resolution}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="message assistant loading">
                <div className="avatar">🤖</div>
                <div className="content">
                  {progress ? (
                    <div className="progress-indicator">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{width: `${progress.percent}%`}}
                        />
                      </div>
                      <span>{progress.message}</span>
                    </div>
                  ) : (
                    <span className="typing">Thinking...</span>
                  )}
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
          
          {/* Input */}
          <div className="input-area">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about a company or request research..."
              disabled={isLoading}
              rows={1}
            />
            <button 
              onClick={sendMessage} 
              disabled={isLoading || !input.trim()}
              className="send-btn"
            >
              Send
            </button>
          </div>
        </div>

        {/* Plan Panel */}
        {showPlan && plan && (
          <div className="plan-panel">
            <div className="plan-header">
              <h2>📋 Account Plan: {plan.company_name}</h2>
              <button className="btn-close" onClick={() => setShowPlan(false)}>×</button>
            </div>
            
            <div className="plan-content">
              {/* Overview Section */}
              <PlanSection 
                title="Company Overview"
                sectionKey="overview"
                data={plan.overview}
                onEdit={handleEditSection}
                isEditing={editingSection === 'overview'}
                editInput={editInput}
                setEditInput={setEditInput}
                onSubmitEdit={submitEdit}
                onCancelEdit={() => setEditingSection(null)}
              />
              
              {/* Business Model */}
              <PlanSection 
                title="Business Model & Products"
                sectionKey="business_model"
                data={plan.business_model}
                onEdit={handleEditSection}
                isEditing={editingSection === 'business_model'}
                editInput={editInput}
                setEditInput={setEditInput}
                onSubmitEdit={submitEdit}
                onCancelEdit={() => setEditingSection(null)}
              />
              
              {/* Recent News */}
              <PlanSection 
                title="Recent News"
                sectionKey="recent_news"
                data={plan.recent_news}
                onEdit={handleEditSection}
                isEditing={editingSection === 'recent_news'}
                editInput={editInput}
                setEditInput={setEditInput}
                onSubmitEdit={submitEdit}
                onCancelEdit={() => setEditingSection(null)}
              />
              
              {/* Leadership */}
              <PlanSection 
                title="Leadership Team"
                sectionKey="leadership"
                data={plan.leadership}
                onEdit={handleEditSection}
                isEditing={editingSection === 'leadership'}
                editInput={editInput}
                setEditInput={setEditInput}
                onSubmitEdit={submitEdit}
                onCancelEdit={() => setEditingSection(null)}
              />
              
              {/* Market Position */}
              <PlanSection 
                title="Competitors & Market Position"
                sectionKey="market_position"
                data={plan.market_position}
                onEdit={handleEditSection}
                isEditing={editingSection === 'market_position'}
                editInput={editInput}
                setEditInput={setEditInput}
                onSubmitEdit={submitEdit}
                onCancelEdit={() => setEditingSection(null)}
              />
              
              {/* Financial Health */}
              <PlanSection 
                title="Financial Health"
                sectionKey="financial_health"
                data={plan.financial_health}
                onEdit={handleEditSection}
                isEditing={editingSection === 'financial_health'}
                editInput={editInput}
                setEditInput={setEditInput}
                onSubmitEdit={submitEdit}
                onCancelEdit={() => setEditingSection(null)}
              />
              
              {/* Pain Points */}
              <PlanSection 
                title="Potential Pain Points"
                sectionKey="pain_points"
                data={plan.pain_points}
                onEdit={handleEditSection}
                isEditing={editingSection === 'pain_points'}
                editInput={editInput}
                setEditInput={setEditInput}
                onSubmitEdit={submitEdit}
                onCancelEdit={() => setEditingSection(null)}
              />
              
              {/* Engagement Strategy */}
              <PlanSection 
                title="Engagement Strategy"
                sectionKey="engagement_strategy"
                data={plan.engagement_strategy}
                onEdit={handleEditSection}
                isEditing={editingSection === 'engagement_strategy'}
                editInput={editInput}
                setEditInput={setEditInput}
                onSubmitEdit={submitEdit}
                onCancelEdit={() => setEditingSection(null)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Plan Section Component
function PlanSection({ 
  title, sectionKey, data, onEdit, isEditing, 
  editInput, setEditInput, onSubmitEdit, onCancelEdit 
}) {
  const renderValue = (value) => {
    if (Array.isArray(value)) {
      return value.length > 0 ? (
        <ul>{value.map((item, i) => (
          <li key={i}>{typeof item === 'object' ? JSON.stringify(item) : item}</li>
        ))}</ul>
      ) : <em>No data</em>
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
        <button className="edit-btn" onClick={() => onEdit(sectionKey)}>
          ✏️ Edit
        </button>
      </div>
      
      {isEditing ? (
        <div className="edit-form">
          <textarea
            value={editInput}
            onChange={(e) => setEditInput(e.target.value)}
            placeholder="Describe what changes you want..."
          />
          <div className="edit-actions">
            <button className="btn btn-primary" onClick={onSubmitEdit}>
              Update
            </button>
            <button className="btn btn-secondary" onClick={onCancelEdit}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="section-content">
          {Object.entries(data).map(([key, value]) => (
            <div key={key} className="field">
              <span className="field-label">{key.replace(/_/g, ' ')}:</span>
              <span className="field-value">{renderValue(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App