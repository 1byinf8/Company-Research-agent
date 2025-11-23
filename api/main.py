"""
FastAPI backend for Company Research Assistant.
Provides REST endpoints and WebSocket for real-time updates.
"""
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Any
import json

from ai_agent.agent import ResearchAgent
from ai_agent.memory import memory

# Initialize FastAPI app
app = FastAPI(
    title="Company Research Assistant",
    description="AI-powered company research and account plan generation",
    version="1.0.0"
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize agent
agent = ResearchAgent()


# ============== Pydantic Models ==============

class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str


class ChatResponse(BaseModel):
    session_id: str
    response: str
    intent: Optional[str] = None
    plan: Optional[dict] = None


class SessionResponse(BaseModel):
    session_id: str
    current_company: Optional[str] = None
    has_plan: bool = False
    research_status: str = "idle"


class EditSectionRequest(BaseModel):
    session_id: str
    section: str
    instructions: str


class SessionSummary(BaseModel):
    session_id: str
    company: Optional[str] = None
    updated_at: str
    msg_count: int


# ============== REST Endpoints ==============

@app.get("/")
async def root():
    return {
        "name": "Company Research Assistant API",
        "version": "1.0.0"
    }


@app.get("/sessions", response_model=List[SessionSummary])
async def get_sessions():
    """Get a list of all saved sessions."""
    return memory.get_all_sessions()


@app.post("/session", response_model=SessionResponse)
async def create_session():
    """Create a new conversation session."""
    session_id = memory.create_session()
    return SessionResponse(session_id=session_id)


@app.get("/session/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    """Get session information."""
    session = memory.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return SessionResponse(
        session_id=session_id,
        current_company=session.current_company,
        has_plan=session.current_plan is not None,
        research_status=session.research_status.value
    )


@app.get("/session/{session_id}/messages")
async def get_session_messages(session_id: str):
    """Get full message history for a session."""
    history = memory.get_history(session_id)
    return history


@app.get("/plan/{session_id}")
async def get_plan(session_id: str):
    """Get the current account plan for a session."""
    plan = memory.get_plan(session_id)
    if not plan:
        raise HTTPException(status_code=404, detail="No plan found for this session")
    
    return plan.model_dump()


@app.post("/edit-section")
async def edit_section(request: EditSectionRequest):
    """Edit a specific section of the account plan."""
    result = await agent.edit_section(
        session_id=request.session_id,
        section_name=request.section,
        edit_instructions=request.instructions
    )
    
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Non-streaming chat endpoint."""
    session_id = request.session_id
    if not session_id:
        session_id = memory.create_session()
    
    full_response = []
    intent = None
    plan = None
    
    async for update in agent.chat(session_id, request.message):
        if update["type"] == "message":
            full_response.append(update["content"])
        elif update["type"] == "intent":
            intent = update["intent"]
        elif update["type"] == "plan_complete":
            plan = update["plan"]
        elif update["type"] == "status":
            full_response.append(f"[{update.get('progress', 0)}%] {update['message']}")
    
    return ChatResponse(
        session_id=session_id,
        response="\n".join(full_response),
        intent=intent,
        plan=plan
    )

@app.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Delete a saved session and its data."""
    session = memory.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    memory.clear_session(session_id)
    return {"message": "Session successfully deleted", "session_id": session_id}


# ============== WebSocket for Streaming ==============

class ConnectionManager:
    """Manage WebSocket connections."""
    
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
    
    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[session_id] = websocket
    
    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]
    
    async def send_json(self, session_id: str, data: dict):
        if session_id in self.active_connections:
            await self.active_connections[session_id].send_json(data)


manager = ConnectionManager()


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time streaming."""
    await manager.connect(session_id, websocket)
    
    # Ensure session exists
    memory.get_or_create_session(session_id)
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "message":
                user_message = data.get("content", "")
                async for update in agent.chat(session_id, user_message):
                    await manager.send_json(session_id, update)
                await manager.send_json(session_id, {"type": "done"})
            
            elif data.get("type") == "edit_section":
                result = await agent.edit_section(
                    session_id=session_id,
                    section_name=data.get("section", ""),
                    edit_instructions=data.get("instructions", "")
                )
                
                if result.get("error"):
                    await manager.send_json(session_id, {
                        "type": "error",
                        "message": result["error"]
                    })
                else:
                    # Send the update to the frontend
                    await manager.send_json(session_id, {
                        "type": "section_updated",
                        "section": result["section"],
                        "updated_content": result["updated_content"],
                        "full_plan": result.get("full_plan")
                    })
                
                await manager.send_json(session_id, {"type": "done"})
    
    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception as e:
        print(f"WS Error: {e}")
        if session_id in manager.active_connections:
             await manager.send_json(session_id, {"type": "error", "message": str(e)})
        manager.disconnect(session_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)