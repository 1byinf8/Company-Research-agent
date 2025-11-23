# Company Research Assistant - AI Agent

An intelligent conversational agent that helps users research companies and generate comprehensive account plans for sales and business development.

## Features

- **Natural Conversation**: Handles confused, efficient, chatty, and edge-case users
- **Multi-Source Research**: Aggregates data from multiple web sources via Tavily
- **Progress Updates**: Real-time streaming updates during research
- **Conflict Detection**: Identifies and reports conflicting information and wait for Human to solve the conflicts
- **Account Plan Generation**: Creates structured, actionable account plans
- **Section Editing**: Allows users to modify specific sections with natural language
- **Voice interface**: Allows users to talk with agent through voice mode and even has a manual text to speech for Agent response

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                      Frontend (React)                                          |
│  Chat Interface │ Account Plan Viewer │ Section Editor | Session Management    │
└────────────────────────────────────────────────────────────────────────────────┘
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

## Project Structure

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

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/yourusername/company-research-assistant.git
cd company-research-assistant

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Frontend Setup
cd frontend
npm install
npm run dev
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

## User Persona Handling

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

## Design Decisions

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

## Architecture Q&A

### 1. Why use Tavily instead of a separate web scraper for URL fetching?

**Answer:** Tavily provides a purpose-built solution for AI agents with several advantages:
- **AI-generated summaries**: Returns both raw results and pre-processed summaries, reducing LLM token usage
- **Reliability**: Handles rate limiting, CAPTCHAs, and anti-bot measures automatically
- **Structured output**: Consistent JSON format with relevance scoring
- **Time savings**: No need to maintain scraping infrastructure or handle edge cases
- **Cost-effective**: Outsourcing scraping complexity is cheaper than building and maintaining custom scrapers

A custom scraper would require significant effort to handle different website structures, dynamic content, authentication, and rate limiting without providing substantial benefits for this use case.

### 2. Why not use a custom web scraper for more control over data extraction?

**Answer:** While custom scrapers offer fine-grained control, they introduce several challenges:
- **Maintenance burden**: Websites change frequently, requiring constant updates
- **Infrastructure costs**: Need to manage proxies, user agents, and anti-bot measures
- **Legal concerns**: Web scraping can violate terms of service; Tavily handles compliance
- **Quality inconsistency**: Different sites return data in different formats
- **Development time**: Building robust scrapers diverts resources from core agent features

Tavily's API abstracts these complexities while providing high-quality, consistent results optimized for LLM consumption.

### 3. What would be the trade-offs of implementing a hybrid approach (Tavily + custom scraper)?

**Answer:** A hybrid approach could provide:

**Pros:**
- Fallback option if Tavily API fails or is unavailable
- Ability to target specific high-value sources with custom extraction
- Potentially deeper data extraction from known company websites

**Cons:**
- Increased code complexity and maintenance overhead
- Higher infrastructure costs (proxies, monitoring)
- More error cases to handle
- Longer development timeline
- Duplicate functionality between systems

For this application, the added complexity outweighs benefits. Tavily's reliability and coverage make a hybrid approach unnecessary.

### 4. Why choose Gemini 2.5 Flash over other LLMs like GPT-4 or Claude?

**Answer:** Gemini 2.5 Flash was selected for several technical and practical reasons:
- **Speed**: Sub-second response times enable real-time conversation
- **JSON mode**: Native support for structured outputs reduces parsing errors
- **Cost efficiency**: Significantly cheaper than GPT-4 Turbo for multi-step workflows
- **Context window**: 1M token context supports large research datasets
- **Reasoning quality**: Strong performance on classification and structured generation tasks

For a production system requiring many LLM calls per research task, Gemini's cost-to-performance ratio is optimal.

### 5. How does the streaming architecture improve user experience?

**Answer:** Streaming provides several UX benefits:
- **Perceived performance**: Users see progress immediately, reducing perceived wait time
- **Transparency**: Real-time updates show what the agent is doing (e.g., "Researching financials...")
- **Early value**: Users can start reading partial results while research continues
- **Engagement**: Progress indicators keep users engaged during long operations
- **Interruption handling**: Users can stop research early if they get what they need
- **Conflict detection**: Can alert users to conflicting information without waiting for completion

Without streaming, users would face a "black box" experience with 30-60 second waits before seeing any output.

### 6. Why use WebSockets instead of HTTP polling or Server-Sent Events (SSE)?

**Answer:** WebSockets were chosen over alternatives:

**vs HTTP Polling:**
- Lower latency (real-time vs 1-5 second delays)
- Reduced server load (persistent connection vs repeated requests)
- More efficient (no HTTP overhead per message)

**vs Server-Sent Events:**
- Bidirectional communication (SSE is server-to-client only)
- Better browser support for complex applications
- Native support in FastAPI with proven libraries

WebSockets provide the most flexible, performant solution for real-time bidirectional communication needed for chat interfaces.

### 7. What is the rationale behind the conversation memory design?

**Answer:** The memory system serves multiple purposes:
- **Context preservation**: Maintains conversation state across multiple turns
- **Research caching**: Stores research data to avoid redundant searches
- **Edit support**: Enables users to modify specific plan sections without re-research
- **Conflict resolution**: Persists conflict information for user review
- **Session management**: Supports multiple concurrent user sessions

The design uses in-memory storage with SQLite persistence, balancing performance (fast reads) with durability (survives restarts).

### 8. Why separate intent classification from action execution?

**Answer:** Separating these concerns provides:
- **Flexibility**: Can change classification logic without touching execution code
- **Testability**: Each component can be tested independently
- **Observability**: Can log and monitor intent accuracy separately
- **Multi-turn support**: Can validate intent before expensive operations
- **Error handling**: Invalid intents caught before resource consumption

This pattern follows the "smart router" architecture common in agent systems, making the codebase more maintainable and debuggable.

### 9. How does conflict detection add value, and what are the implementation challenges?

**Answer:** Conflict detection provides:

**Value:**
- **Data quality**: Identifies contradictory information before plan generation
- **Trust**: Shows users the agent recognizes discrepancies
- **User control**: Allows users to guide resolution
- **Accuracy**: Prevents mixing incompatible data in final plans

**Challenges:**
- **LLM reliability**: Requires careful prompting to consistently detect conflicts
- **Context limits**: Large research datasets may exceed LLM context windows
- **False positives**: May flag legitimate differences as conflicts
- **UX complexity**: Need intuitive UI for presenting conflicts to users

The implementation uses targeted prompts and thresholds to balance sensitivity with usability.

### 10. Why use Pydantic models for data structures?

**Answer:** Pydantic provides several benefits:
- **Type safety**: Runtime validation catches data errors early
- **Serialization**: Automatic JSON conversion for API responses
- **Documentation**: Self-documenting schemas for API endpoints
- **LLM integration**: Structured outputs validate against schemas
- **Maintainability**: Clear contracts between components

This is particularly valuable when parsing LLM outputs, where unexpected formats can cause crashes.

### 11. What database choice was made and why?

**Answer:** SQLite was chosen for:
- **Simplicity**: Zero-configuration, embedded database
- **Portability**: Single file, easy to backup and move
- **Performance**: Sufficient for single-server deployments
- **Cost**: No separate database server required
- **Development speed**: No schema migrations or complex ORM setup

For a multi-tenant production deployment, migrating to PostgreSQL would be straightforward while keeping the same data models.

### 12. How does the system handle rate limiting from external APIs?

**Answer:** Rate limiting is handled at multiple levels:
- **Tavily client**: Built-in delays between requests (0.2s)
- **Retry logic**: Exponential backoff for transient failures
- **Error propagation**: Graceful degradation if searches fail
- **User communication**: Progress updates inform users of delays

Future improvements could include:
- Request queuing for concurrent users
- API key rotation for higher throughput
- Caching frequent searches

### 13. Why use FastAPI for the backend instead of Flask or Django?

**Answer:** FastAPI advantages:
- **Async native**: Built-in support for async/await patterns used in agent code
- **WebSocket support**: First-class WebSocket implementation
- **Type hints**: Leverages Python type annotations for automatic validation
- **Performance**: Comparable to Node.js with async operations
- **OpenAPI**: Automatic API documentation generation
- **Modern**: Designed for Python 3.7+ with current best practices

Flask lacks native async support, and Django is overkill for an agent-focused API.

### 14. What testing strategy was chosen and why?

**Answer:** The testing approach includes:
- **Persona-based tests**: Validates handling of different user types
- **Integration tests**: Tests full workflows end-to-end
- **Mock external APIs**: Isolates tests from Tavily/Gemini dependencies
- **Snapshot testing**: Validates consistent output formats

This balances coverage with maintainability. Unit tests for every function would be brittle due to heavy LLM integration. Persona tests validate actual user-facing behavior.

### 15. How does the architecture support future scalability requirements?

**Answer:** Several design choices enable scaling:
- **Stateless agents**: Each request is independent, supporting horizontal scaling
- **Async architecture**: Non-blocking operations maximize throughput
- **Modular tools**: Easy to add new research sources or LLM providers
- **Session isolation**: Multiple users don't interfere with each other
- **Configurable components**: API keys and settings externalized

To scale further:
- Add Redis for distributed session storage
- Implement task queues (Celery) for long-running research
- Use PostgreSQL for multi-server persistence
- Add caching layer for repeated queries
- Deploy behind load balancer with multiple backend instances

The current architecture supports these migrations without major refactoring.

## Account Plan Structure

1. **Company Overview** - Basics, size, revenue
2. **Business Model** - Products, revenue streams
3. **Recent News** - Last 6 months developments
4. **Leadership** - Key executives
5. **Market Position** - Competitors, advantages
6. **Financial Health** - Funding, growth metrics
7. **Pain Points** - Challenges and opportunities
8. **Engagement Strategy** - How to approach

## Testing

```bash
# Run all tests
pytest tests/ -v

# Test specific persona
python test_agent.py  # Runs predefined test scenarios
```

## 🛣️ Roadmap

- [x] AI Agent Core
- [x] FastAPI Backend
- [x] React Frontend
- [x] Voice Interface

## 📄 License

MIT
