"""
Main Agent Orchestrator - The brain of the research assistant.
"""
import asyncio
import json
from typing import AsyncGenerator, Optional
from datetime import datetime

from .models import (
    UserIntent, ResearchStatus, AccountPlan, ResearchProgress,
    CompanyOverview, BusinessModel, RecentNews, Leadership,
    MarketPosition, FinancialHealth, PainPoints, EngagementStrategy
)
from .memory import ConversationMemory, memory
from .tools.gemini_client import GeminiClient
from .tools.tavily_search import TavilySearchTool, format_results_for_llm
from .prompts import (
    INTENT_CLASSIFIER_PROMPT, RESEARCH_ORCHESTRATOR_PROMPT,
    CONFLICT_DETECTOR_PROMPT, PLAN_GENERATOR_PROMPT,
    SECTION_EDITOR_PROMPT, CONVERSATION_PROMPT,
    CONFUSED_USER_HANDLER, EFFICIENT_USER_HANDLER, CHATTY_USER_HANDLER
)


class ResearchAgent:
    """Main orchestrator for the Company Research Assistant."""
    
    def __init__(self, gemini_api_key: Optional[str] = None, tavily_api_key: Optional[str] = None):
        self.llm = GeminiClient(api_key=gemini_api_key)
        self.search = TavilySearchTool(api_key=tavily_api_key)
        self.memory = memory
    
    async def classify_intent(self, session_id: str, user_message: str) -> dict:
        """Classify user intent from their message."""
        session = self.memory.get_or_create_session(session_id)
        
        prompt = INTENT_CLASSIFIER_PROMPT.format(
            current_company=session.current_company or "None",
            research_status=session.research_status.value,
            has_plan=session.current_plan is not None,
            user_message=user_message
        )
        
        try:
            result = await self.llm.generate_json(prompt, temperature=0.1)
            return result
        except Exception as e:
            return {
                "intent": "GENERAL_CHAT",
                "company_name": None,
                "confidence": 0.5,
                "error": str(e)
            }
    
    async def generate_research_queries(self, company_name: str, focus_area: Optional[str] = None) -> list[dict]:
        """Generate search queries for company research."""
        prompt = RESEARCH_ORCHESTRATOR_PROMPT.format(
            company_name=company_name,
            focus_area=focus_area or "general comprehensive research"
        )
        result = await self.llm.generate_json(prompt, temperature=0.3)
        return result.get("queries", [])
    
    async def detect_conflicts(self, company_name: str, search_results: str) -> dict:
        """Analyze research results for conflicts."""
        if not search_results or len(search_results.strip()) < 50:
            return {"conflicts_found": False, "conflicts": [], "recommendation": "Limited data collected"}
        
        prompt = CONFLICT_DETECTOR_PROMPT.format(company_name=company_name, search_results=search_results)
        
        try:
            return await self.llm.generate_json(prompt, temperature=0.2)
        except Exception as e:
            return {"conflicts_found": False, "conflicts": [], "recommendation": f"Could not analyze: {str(e)}"}
    
    async def research_company(self, session_id: str, company_name: str, focus_area: Optional[str] = None) -> AsyncGenerator[dict, None]:
        """Execute full research workflow with streaming progress."""
        self.memory.set_current_company(session_id, company_name)
        self.memory.set_research_status(session_id, ResearchStatus.RESEARCHING)
        
        yield {"type": "status", "message": f"Planning research strategy for {company_name}...", "progress": 5}
        
        queries = await self.generate_research_queries(company_name, focus_area)
        yield {"type": "status", "message": f"Generated {len(queries)} research queries. Starting research...", "progress": 10}
        
        all_results = {}
        async for update in self.search.research_company(company_name, queries):
            if update["type"] == "progress":
                base_progress = 10
                search_progress = int((update["percent"] / 100) * 60)
                yield {"type": "status", "message": update["message"], "progress": base_progress + search_progress}
            elif update["type"] == "result":
                answer = update["data"].get("answer") or ""
                yield {"type": "research_update", "section": update["section"], "preview": answer[:200] if answer else "Data collected"}
            elif update["type"] == "complete":
                all_results = update["results_by_section"]
        
        yield {"type": "status", "message": "Analyzing research for conflicts...", "progress": 75}
        
        formatted_results = format_results_for_llm(all_results)
        conflicts = await self.detect_conflicts(company_name, formatted_results)
        
        if conflicts.get("conflicts_found"):
            self.memory.set_research_status(session_id, ResearchStatus.CONFLICT_FOUND)
            yield {"type": "conflicts", "conflicts": conflicts["conflicts"], "recommendation": conflicts["recommendation"]}
        
        self.memory.set_user_context(session_id, "research_data", formatted_results)
        self.memory.set_user_context(session_id, "focus_area", focus_area)
        
        yield {"type": "status", "message": "Research complete. Generating account plan...", "progress": 80}
        self.memory.set_research_status(session_id, ResearchStatus.COMPLETED)
        yield {"type": "complete", "company": company_name, "sections_researched": list(all_results.keys()), "conflicts_found": conflicts.get("conflicts_found", False)}
    
    async def generate_plan(self, session_id: str) -> AsyncGenerator[dict, None]:
        """Generate the account plan from research data."""
        session = self.memory.get_session(session_id)
        if not session or not session.current_company:
            yield {"type": "error", "message": "No company researched yet"}
            return
        
        research_data = self.memory.get_user_context(session_id, "research_data")
        focus_area = self.memory.get_user_context(session_id, "focus_area")
        
        yield {"type": "status", "message": "Generating comprehensive account plan...", "progress": 85}
        
        prompt = PLAN_GENERATOR_PROMPT.format(
            company_name=session.current_company,
            focus_area=focus_area or "general",
            research_data=research_data or "No research data available"
        )
        
        try:
            plan_data = await self.llm.generate_json(prompt, temperature=0.4, retries=4)
            
            # Helper to sanitize list fields that might come back as strings
            def sanitize_list_fields(section_data: dict, fields: list[str]):
                if not isinstance(section_data, dict):
                    return
                for field in fields:
                    if field in section_data:
                        val = section_data[field]
                        if val is None:
                            section_data[field] = []
                        elif isinstance(val, str):
                            # If LLM returns "Not available", "None", etc., make it an empty list
                            if val.lower() in ["not available", "none", "n/a", "unknown"]:
                                section_data[field] = []
                            else:
                                # Otherwise wrap the string in a list
                                section_data[field] = [val]

            # Apply sanitization to all sections with list fields
            sanitize_list_fields(plan_data.get("business_model"), ["core_products", "revenue_streams"])
            sanitize_list_fields(plan_data.get("recent_news"), ["items", "key_themes"])
            sanitize_list_fields(plan_data.get("leadership"), ["executives"])
            sanitize_list_fields(plan_data.get("market_position"), ["competitors", "competitive_advantages", "competitive_weaknesses"])
            sanitize_list_fields(plan_data.get("financial_health"), ["public_metrics"])
            sanitize_list_fields(plan_data.get("pain_points"), ["challenges", "industry_pressures", "opportunities"])
            sanitize_list_fields(plan_data.get("engagement_strategy"), ["talking_points", "potential_objections", "recommended_contacts"])

            # Build plan with safe defaults
            def safe_get(d, key, default):
                return d.get(key, default) if d else default
            
            overview_data = safe_get(plan_data, "overview", {})
            overview_data["name"] = overview_data.get("name", session.current_company)
            
            plan = AccountPlan(
                company_name=session.current_company,
                research_focus=focus_area,
                overview=CompanyOverview(**overview_data),
                business_model=BusinessModel(**safe_get(plan_data, "business_model", {})),
                recent_news=RecentNews(**safe_get(plan_data, "recent_news", {})),
                leadership=Leadership(**safe_get(plan_data, "leadership", {})),
                market_position=MarketPosition(**safe_get(plan_data, "market_position", {})),
                financial_health=FinancialHealth(**safe_get(plan_data, "financial_health", {})),
                pain_points=PainPoints(**safe_get(plan_data, "pain_points", {})),
                engagement_strategy=EngagementStrategy(**safe_get(plan_data, "engagement_strategy", {}))
            )
            
            self.memory.set_plan(session_id, plan)
            yield {"type": "status", "message": "Account plan generated successfully.", "progress": 100}
            # Use mode='json' to serialize datetimes safely
            yield {"type": "plan_complete", "plan": plan.model_dump(mode='json')}
            
        except Exception as e:
            yield {"type": "error", "message": f"Failed to generate plan: {str(e)}"}
    
    async def edit_section(self, session_id: str, section_name: str, edit_instructions: str) -> dict:
        """Edit a specific section of the account plan."""
        session = self.memory.get_session(session_id)
        if not session or not session.current_plan:
            return {"error": "No plan exists to edit"}
        
        plan = session.current_plan
        section_map = {
            "overview": "overview", "business_model": "business_model", "business model": "business_model",
            "recent_news": "recent_news", "news": "recent_news", "leadership": "leadership",
            "market_position": "market_position", "market position": "market_position", "competitors": "market_position",
            "financial_health": "financial_health", "financial": "financial_health", "financials": "financial_health",
            "pain_points": "pain_points", "pain points": "pain_points", "challenges": "pain_points",
            "engagement_strategy": "engagement_strategy", "engagement": "engagement_strategy", "strategy": "engagement_strategy"
        }
        
        attr_name = section_map.get(section_name.lower())
        if not attr_name:
            return {"error": f"Unknown section: {section_name}"}
        
        current_content = getattr(plan, attr_name).model_dump(mode='json')
        
        additional_research = ""
        if "more detail" in edit_instructions.lower() or "expand" in edit_instructions.lower():
            query = f"{plan.company_name} {section_name} detailed information"
            search_result = await self.search.search(query)
            additional_research = search_result.answer or ""
        
        prompt = SECTION_EDITOR_PROMPT.format(
            company_name=plan.company_name, section_name=section_name,
            current_content=json.dumps(current_content, indent=2),
            edit_request=edit_instructions, additional_research=additional_research
        )
        
        updated_data = await self.llm.generate_json(prompt, temperature=0.3)
        section_class = type(getattr(plan, attr_name))
        setattr(plan, attr_name, section_class(**updated_data))
        self.memory.set_plan(session_id, plan)
        
        return {"success": True, "section": section_name, "updated_content": updated_data}
    
    async def chat(self, session_id: str, user_message: str) -> AsyncGenerator[dict, None]:
        """Main conversation handler - routes to appropriate actions."""
        session = self.memory.get_or_create_session(session_id)
        self.memory.add_message(session_id, "user", user_message)
        
        intent_result = await self.classify_intent(session_id, user_message)
        intent = intent_result.get("intent", "GENERAL_CHAT")
        company_name = intent_result.get("company_name")
        extracted_focus = intent_result.get("focus_area")
        
        yield {"type": "intent", "intent": intent, "confidence": intent_result.get("confidence", 0)}
        
        if intent == "START_RESEARCH" and company_name:
            # Use specific focus if extracted, otherwise fall back to memory
            existing_focus = self.memory.get_user_context(session_id, "focus_area")
            focus_area = extracted_focus if extracted_focus else existing_focus
            
            yield {"type": "message", "content": f"Starting research on {company_name}...\n\n"}
            
            async for update in self.research_company(session_id, company_name, focus_area):
                yield update
            
            async for update in self.generate_plan(session_id):
                yield update
        
        elif intent == "EDIT_SECTION":
            section = intent_result.get("section_to_edit")
            instructions = intent_result.get("edit_instructions") or user_message
            yield {"type": "message", "content": f"Updating the {section} section...\n"}
            result = await self.edit_section(session_id, section, instructions)
            if result.get("success"):
                yield {"type": "section_updated", "section": section, "content": result["updated_content"]}
            else:
                yield {"type": "error", "message": result.get("error")}
        
        elif intent == "GENERATE_PLAN":
            if session.current_company:
                async for update in self.generate_plan(session_id):
                    yield update
            else:
                yield {"type": "message", "content": "I don't have any research data yet. Which company would you like me to research?"}
        
        elif intent == "OFF_TOPIC":
            response = await self._generate_conversation_response(
                session_id, user_message, 
                extra_context="User is off-topic. Gently redirect to company research."
            )
            yield {"type": "message", "content": response}
        
        elif intent == "CLARIFICATION_NEEDED":
            response = await self._generate_conversation_response(session_id, user_message, extra_context=CONFUSED_USER_HANDLER)
            yield {"type": "message", "content": response}
        
        elif intent == "GENERAL_CHAT" or intent == "ASK_QUESTION":
            # Handle general chat without triggering research
            response = await self._generate_conversation_response(session_id, user_message)
            yield {"type": "message", "content": response}
        
        else:
            response = await self._generate_conversation_response(session_id, user_message)
            yield {"type": "message", "content": response}
    
    async def _generate_conversation_response(self, session_id: str, user_message: str, extra_context: str = "") -> str:
        """Generate a conversational response."""
        session = self.memory.get_session(session_id)
        history = self.memory.get_history_string(session_id, limit=6)
        plan_status = "Generated" if session.current_plan else "Not yet generated"
        
        system_prompt = CONVERSATION_PROMPT.format(
            current_company=session.current_company or "None",
            plan_status=plan_status,
            research_status=session.research_status.value,
            conversation_history=history,
            user_message=user_message
        )
        
        if extra_context:
            system_prompt += f"\n\nAdditional context:\n{extra_context}"
        
        response = await self.llm.generate(prompt=user_message, system_prompt=system_prompt, temperature=0.7)
        return response.text


async def create_agent() -> ResearchAgent:
    """Create and return a configured agent instance."""
    return ResearchAgent()