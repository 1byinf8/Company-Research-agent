"""
Pydantic models for structured data throughout the agent.
"""
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum
from datetime import datetime


class UserIntent(str, Enum):
    """Classified intent from user message."""
    START_RESEARCH = "start_research"
    CONTINUE_RESEARCH = "continue_research"
    EDIT_SECTION = "edit_section"
    ASK_QUESTION = "ask_question"
    CLARIFICATION_NEEDED = "clarification_needed"
    OFF_TOPIC = "off_topic"
    GENERATE_PLAN = "generate_plan"
    EXPORT_PLAN = "export_plan"


class ResearchStatus(str, Enum):
    """Status of ongoing research."""
    IDLE = "idle"
    RESEARCHING = "researching"
    CONFLICT_FOUND = "conflict_found"
    COMPLETED = "completed"
    ERROR = "error"


class CompanyOverview(BaseModel):
    """Section 1: Company Overview."""
    name: str
    founded: Optional[str] = None
    headquarters: Optional[str] = None
    industry: Optional[str] = None
    employee_count: Optional[str] = None
    revenue: Optional[str] = None
    description: Optional[str] = None


class BusinessModel(BaseModel):
    """Section 2: Business Model & Products."""
    core_products: list[str] = Field(default_factory=list)
    revenue_streams: list[str] = Field(default_factory=list)
    target_market: Optional[str] = None
    value_proposition: Optional[str] = None


class NewsItem(BaseModel):
    """Individual news item."""
    title: str
    summary: str
    date: Optional[str] = None
    source: Optional[str] = None
    url: Optional[str] = None


class RecentNews(BaseModel):
    """Section 3: Recent News & Developments."""
    items: list[NewsItem] = Field(default_factory=list)
    key_themes: list[str] = Field(default_factory=list)


class Leader(BaseModel):
    """Individual leader profile."""
    name: str
    title: str
    background: Optional[str] = None
    linkedin_url: Optional[str] = None


class Leadership(BaseModel):
    """Section 4: Leadership Team."""
    executives: list[Leader] = Field(default_factory=list)
    recent_changes: Optional[str] = None


class Competitor(BaseModel):
    """Individual competitor."""
    name: str
    differentiator: Optional[str] = None


class MarketPosition(BaseModel):
    """Section 5: Competitors & Market Position."""
    competitors: list[Competitor] = Field(default_factory=list)
    market_share: Optional[str] = None
    competitive_advantages: list[str] = Field(default_factory=list)
    competitive_weaknesses: list[str] = Field(default_factory=list)


class FinancialHealth(BaseModel):
    """Section 6: Financial Health."""
    funding_total: Optional[str] = None
    last_funding_round: Optional[str] = None
    revenue_growth: Optional[str] = None
    profitability: Optional[str] = None
    public_metrics: list[str] = Field(default_factory=list)


class PainPoints(BaseModel):
    """Section 7: Potential Pain Points."""
    challenges: list[str] = Field(default_factory=list)
    industry_pressures: list[str] = Field(default_factory=list)
    opportunities: list[str] = Field(default_factory=list)


class EngagementStrategy(BaseModel):
    """Section 8: Engagement Strategy."""
    approach: Optional[str] = None
    talking_points: list[str] = Field(default_factory=list)
    potential_objections: list[str] = Field(default_factory=list)
    recommended_contacts: list[str] = Field(default_factory=list)


class AccountPlan(BaseModel):
    """Complete Account Plan structure."""
    company_name: str
    generated_at: datetime = Field(default_factory=datetime.now)
    research_focus: Optional[str] = None
    
    overview: CompanyOverview = Field(default_factory=lambda: CompanyOverview(name=""))
    business_model: BusinessModel = Field(default_factory=BusinessModel)
    recent_news: RecentNews = Field(default_factory=RecentNews)
    leadership: Leadership = Field(default_factory=Leadership)
    market_position: MarketPosition = Field(default_factory=MarketPosition)
    financial_health: FinancialHealth = Field(default_factory=FinancialHealth)
    pain_points: PainPoints = Field(default_factory=PainPoints)
    engagement_strategy: EngagementStrategy = Field(default_factory=EngagementStrategy)
    
    # Metadata
    sources: list[str] = Field(default_factory=list)
    conflicts_found: list[str] = Field(default_factory=list)


class ResearchProgress(BaseModel):
    """Progress update during research."""
    status: ResearchStatus
    current_task: str
    progress_percent: int = 0
    message: str
    conflicts: list[str] = Field(default_factory=list)


class ConversationMessage(BaseModel):
    """Single message in conversation history."""
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)
    metadata: dict = Field(default_factory=dict)


class ConversationState(BaseModel):
    """Full conversation state."""
    session_id: str
    messages: list[ConversationMessage] = Field(default_factory=list)
    current_company: Optional[str] = None
    current_plan: Optional[AccountPlan] = None
    research_status: ResearchStatus = ResearchStatus.IDLE
    user_context: dict = Field(default_factory=dict)  # Store user preferences, focus areas