"""
Conversation memory and state management with SQLite persistence.
"""
import uuid
import sqlite3
import json
from datetime import datetime
from typing import Optional
from pathlib import Path
from .models import (
    ConversationState, 
    ConversationMessage, 
    AccountPlan, 
    ResearchStatus
)

DB_PATH = "research_agent.db"

class ConversationMemory:
    """
    Manages conversation state and history using SQLite for persistence.
    """
    
    def __init__(self):
        self._init_db()
    
    def _init_db(self):
        """Initialize the SQLite database and create tables."""
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()

    def _save_session(self, session: ConversationState):
        """Serialize and save session state to DB."""
        # model_dump_json() handles datetime serialization automatically
        json_data = session.model_dump_json()
        
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO sessions (session_id, data, updated_at) 
                VALUES (?, ?, ?)
                """,
                (session.session_id, json_data, datetime.now())
            )
            conn.commit()

    def create_session(self) -> str:
        """Create a new conversation session."""
        session_id = str(uuid.uuid4())
        session = ConversationState(session_id=session_id)
        self._save_session(session)
        return session_id
    
    def get_session(self, session_id: str) -> Optional[ConversationState]:
        """Get existing session or None."""
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.execute("SELECT data FROM sessions WHERE session_id = ?", (session_id,))
            row = cursor.fetchone()
            
            if row:
                try:
                    return ConversationState.model_validate_json(row[0])
                except Exception as e:
                    print(f"Error parsing session {session_id}: {e}")
                    return None
        return None
    
    def get_or_create_session(self, session_id: Optional[str] = None) -> ConversationState:
        """Get existing session or create new one."""
        if session_id:
            session = self.get_session(session_id)
            if session:
                return session
        
        # Create new if not found or not provided
        new_id = session_id or str(uuid.uuid4())
        session = ConversationState(session_id=new_id)
        self._save_session(session)
        return session
    
    def add_message(
        self, 
        session_id: str, 
        role: str, 
        content: str,
        metadata: Optional[dict] = None
    ) -> ConversationMessage:
        """Add a message to conversation history."""
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        message = ConversationMessage(
            role=role,
            content=content,
            timestamp=datetime.now(),
            metadata=metadata or {}
        )
        session.messages.append(message)
        self._save_session(session)
        return message
    
    def get_history(
        self, 
        session_id: str, 
        limit: Optional[int] = None
    ) -> list[ConversationMessage]:
        """Get conversation history, optionally limited to last N messages."""
        session = self.get_session(session_id)
        if not session:
            return []
        
        messages = session.messages
        if limit:
            messages = messages[-limit:]
        return messages
    
    def get_history_for_llm(
        self, 
        session_id: str, 
        limit: int = 10
    ) -> list[dict]:
        """
        Format history for LLM consumption.
        Returns list of {"role": str, "content": str}
        """
        messages = self.get_history(session_id, limit)
        return [
            {"role": msg.role, "content": msg.content}
            for msg in messages
        ]
    
    def get_history_string(
        self, 
        session_id: str, 
        limit: int = 10
    ) -> str:
        """Format history as a string for prompt injection."""
        messages = self.get_history(session_id, limit)
        if not messages:
            return "No previous conversation."
        
        lines = []
        for msg in messages:
            role = "User" if msg.role == "user" else "Assistant"
            lines.append(f"{role}: {msg.content}")
        
        return "\n".join(lines)
    
    def set_current_company(self, session_id: str, company: str):
        """Set the company being researched."""
        session = self.get_session(session_id)
        if session:
            session.current_company = company
            self._save_session(session)
    
    def get_current_company(self, session_id: str) -> Optional[str]:
        """Get the company being researched."""
        session = self.get_session(session_id)
        return session.current_company if session else None
    
    def set_plan(self, session_id: str, plan: AccountPlan):
        """Store the generated account plan."""
        session = self.get_session(session_id)
        if session:
            session.current_plan = plan
            self._save_session(session)
    
    def get_plan(self, session_id: str) -> Optional[AccountPlan]:
        """Get the current account plan."""
        session = self.get_session(session_id)
        return session.current_plan if session else None
    
    def set_research_status(self, session_id: str, status: ResearchStatus):
        """Update research status."""
        session = self.get_session(session_id)
        if session:
            session.research_status = status
            self._save_session(session)
    
    def get_research_status(self, session_id: str) -> ResearchStatus:
        """Get current research status."""
        session = self.get_session(session_id)
        return session.research_status if session else ResearchStatus.IDLE
    
    def set_user_context(self, session_id: str, key: str, value: any):
        """Store user context/preferences."""
        session = self.get_session(session_id)
        if session:
            session.user_context[key] = value
            self._save_session(session)
    
    def get_user_context(self, session_id: str, key: str) -> any:
        """Get user context value."""
        session = self.get_session(session_id)
        if session:
            return session.user_context.get(key)
        return None
    
    def clear_session(self, session_id: str):
        """Clear a session completely."""
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
            conn.commit()
    
    def get_session_summary(self, session_id: str) -> dict:
        """Get a summary of the session state."""
        session = self.get_session(session_id)
        if not session:
            return {"error": "Session not found"}
        
        return {
            "session_id": session_id,
            "message_count": len(session.messages),
            "current_company": session.current_company,
            "has_plan": session.current_plan is not None,
            "research_status": session.research_status.value,
            "user_context": session.user_context
        }
    
    def get_all_sessions(self) -> list[dict]:
        """List all available sessions (useful for history UI)."""
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.execute("SELECT session_id, data, updated_at FROM sessions ORDER BY updated_at DESC")
            sessions = []
            for row in cursor:
                try:
                    data = json.loads(row[1])
                    sessions.append({
                        "session_id": row[0],
                        "company": data.get("current_company"),
                        "updated_at": row[2],
                        "msg_count": len(data.get("messages", []))
                    })
                except:
                    continue
            return sessions


# Singleton instance for simple usage
memory = ConversationMemory()