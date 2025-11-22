# Company Research Assistant - AI Agent

An intelligent conversational agent that helps users research companies and generate comprehensive account plans for sales and business development.

## 🎯 Features

- **Natural Conversation**: Handles confused, efficient, chatty, and edge-case users
- **Multi-Source Research**: Aggregates data from multiple web sources via Tavily
- **Progress Updates**: Real-time streaming updates during research
- **Conflict Detection**: Identifies and reports conflicting information
- **Account Plan Generation**: Creates structured, actionable account plans
- **Section Editing**: Allows users to modify specific sections with natural language

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                       │
│  Chat Interface │ Account Plan Viewer │ Section Editor      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend (FastAPI)                         │
│  WebSocket Handler │ Session Manager │ API Routes           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   AI Agent Layer                            │
│  Intent Classifier │ Research Orchestrator │ Plan Generator │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────┐
│      Gemini 2.5 Flash   │     │        Tavily Search        │
│  - Intent Detection     │     │  - Company Research         │
│  - Plan Generation      │     │  - News Aggregation         │
│  - Conversation         │     │  - Conflict Sources         │
└─────────────────────────┘     └─────────────────────────────┘
```

## 📁 Project Structure

```
company-research-assistant/
├── ai_agent/
│   ├── __init__.py
│   ├── agent.py              # Main orchestrator
│   ├── models.py             # Pydantic data models
│   ├── memory.py             # Conversation state
│   ├── prompts.py            # System prompts
│   └── tools/
│       ├── __init__.py
│       ├── gemini_client.py  # Gemini API client
│       └── tavily_search.py  # Tavily search tool
├── api/
│   ├── __init__.py
│   ├── main.py               # FastAPI app
│   ├── routes.py             # API endpoints
│   └── websocket.py          # WebSocket handler
├── frontend/                  # React app (Phase 3)
├── tests/
│   └── test_agent.py
├── .env.example
├── requirements.txt
└── README.md
```

## 🚀 Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/yourusername/company-research-assistant.git
cd company-research-assistant

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and add your API keys
```

### 3. Test the Agent

```bash
# Run automated tests
python test_agent.py

# Interactive demo
python test_agent.py --interactive
```

### 4. Start the API Server (Phase 2)

```bash
uvicorn api.main:app --reload
```

## 🎭 User Persona Handling

### Confused User
```
User: "um... I need to research something?"
Agent: "I can help you research any company. Would you like to:
       1. Research a specific company you have in mind?
       2. Explore companies in a particular industry?
       Just let me know!"
```

### Efficient User
```
User: "Account plan for Stripe, enterprise focus"
Agent: [Immediately starts research, streams progress, delivers plan]
```

### Chatty User
```
User: "So I was thinking about Salesforce, reminds me of 2015..."
Agent: "That insider context is valuable! Let me research their 
       current state so you can see what's changed."
```

### Edge Case User
```
User: "What's the best pizza in NYC?"
Agent: "I'm designed for company research. I can help research 
       pizza companies though - like Domino's. Would that help?"
```

## 🔧 Design Decisions

### Why Gemini 2.5 Flash?
- Fast inference for responsive conversations
- Strong reasoning for intent classification
- JSON mode for structured outputs
- Cost-effective for multi-step workflows

### Why Tavily?
- Purpose-built for AI agents
- Returns both raw results and AI summaries
- Good coverage of business/company data
- Simple API with reliable results

### Streaming Architecture
- Provides real-time progress updates
- Keeps users engaged during research
- Enables early conflict detection
- Better UX than waiting for completion

### Conversation Memory
- Maintains context across interactions
- Stores research state and plans
- Enables section-specific editing
- Supports multi-turn clarifications

## 📊 Account Plan Structure

1. **Company Overview** - Basics, size, revenue
2. **Business Model** - Products, revenue streams
3. **Recent News** - Last 6 months developments
4. **Leadership** - Key executives
5. **Market Position** - Competitors, advantages
6. **Financial Health** - Funding, growth metrics
7. **Pain Points** - Challenges and opportunities
8. **Engagement Strategy** - How to approach

## 🧪 Testing

```bash
# Run all tests
pytest tests/ -v

# Test specific persona
python test_agent.py  # Runs predefined test scenarios
```

## 📹 Demo Scenarios

The demo video covers:
1. Architecture walkthrough (1.5 min)
2. Confused user guidance (2 min)
3. Efficient user quick research (2 min)
4. Conflict detection handling (1.5 min)
5. Section editing (1.5 min)
6. Edge cases (1 min)

## 🛣️ Roadmap

- [x] AI Agent Core
- [ ] FastAPI Backend
- [ ] React Frontend
- [ ] Voice Interface
- [ ] Export to PDF/Doc
- [ ] Company Comparison Mode

## 📄 License

MIT