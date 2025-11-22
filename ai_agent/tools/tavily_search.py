"""
Tavily Search API integration for company research.
"""
import aiohttp
import asyncio
from typing import AsyncGenerator, Optional
from dataclasses import dataclass
import os


@dataclass
class SearchResult:
    """Individual search result."""
    title: str
    url: str
    content: str
    score: float
    published_date: Optional[str] = None


@dataclass
class SearchResponse:
    """Complete search response."""
    query: str
    results: list[SearchResult]
    answer: Optional[str] = None  # Tavily's AI-generated answer


class TavilySearchTool:
    """Async Tavily search client for company research."""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("TAVILY_API_KEY")
        if not self.api_key:
            raise ValueError("TAVILY_API_KEY not found in environment")
        self.base_url = "https://api.tavily.com"
    
    async def search(
        self,
        query: str,
        search_depth: str = "advanced",  # "basic" or "advanced"
        max_results: int = 5,
        include_answer: bool = True,
        include_domains: Optional[list[str]] = None,
        exclude_domains: Optional[list[str]] = None
    ) -> SearchResponse:
        """
        Execute a search query.
        
        Args:
            query: Search query string
            search_depth: "basic" (faster) or "advanced" (more thorough)
            max_results: Number of results to return
            include_answer: Include Tavily's AI-generated answer
            include_domains: Only search these domains
            exclude_domains: Exclude these domains
        """
        payload = {
            "api_key": self.api_key,
            "query": query,
            "search_depth": search_depth,
            "max_results": max_results,
            "include_answer": include_answer,
        }
        
        if include_domains:
            payload["include_domains"] = include_domains
        if exclude_domains:
            payload["exclude_domains"] = exclude_domains
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/search",
                json=payload
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Tavily API error: {response.status} - {error_text}")
                
                data = await response.json()
        
        results = [
            SearchResult(
                title=r.get("title", ""),
                url=r.get("url", ""),
                content=r.get("content", ""),
                score=r.get("score", 0.0),
                published_date=r.get("published_date")
            )
            for r in data.get("results", [])
        ]
        
        return SearchResponse(
            query=query,
            results=results,
            answer=data.get("answer")
        )
    
    async def research_company(
        self,
        company_name: str,
        queries: list[dict],
        progress_callback: Optional[callable] = None
    ) -> AsyncGenerator[dict, None]:
        """
        Execute multiple research queries with progress updates.
        
        Args:
            company_name: Name of company being researched
            queries: List of {"query": str, "section": str, "priority": int}
            progress_callback: Optional async callback for progress updates
        
        Yields:
            Progress updates and results as they complete
        """
        # Sort by priority
        sorted_queries = sorted(queries, key=lambda x: x.get("priority", 5))
        total = len(sorted_queries)
        results_by_section = {}
        
        for i, q in enumerate(sorted_queries):
            query = q["query"]
            section = q["section"]
            
            # Yield progress update
            progress = {
                "type": "progress",
                "current": i + 1,
                "total": total,
                "percent": int((i / total) * 100),
                "message": f"Researching: {section}...",
                "query": query
            }
            yield progress
            
            if progress_callback:
                await progress_callback(progress)
            
            try:
                response = await self.search(query, search_depth="advanced")
                
                if section not in results_by_section:
                    results_by_section[section] = []
                
                results_by_section[section].append({
                    "query": query,
                    "answer": response.answer or "",
                    "results": [
                        {
                            "title": r.title,
                            "url": r.url,
                            "content": r.content,
                            "date": r.published_date
                        }
                        for r in (response.results or [])
                    ]
                })
                
                # Yield individual result
                yield {
                    "type": "result",
                    "section": section,
                    "query": query,
                    "data": results_by_section[section][-1]
                }
                
            except Exception as e:
                yield {
                    "type": "error",
                    "section": section,
                    "query": query,
                    "error": str(e)
                }
            
            # Small delay to avoid rate limiting
            await asyncio.sleep(0.2)
        
        # Final yield with all results
        yield {
            "type": "complete",
            "results_by_section": results_by_section,
            "total_queries": total,
            "company": company_name
        }
    
    async def quick_search(self, query: str) -> str:
        """
        Quick search that returns just the AI-generated answer.
        Useful for simple fact-checking.
        """
        response = await self.search(query, search_depth="basic", max_results=3)
        return response.answer or "No answer generated"
    
    async def get_recent_news(
        self,
        company_name: str,
        max_results: int = 5
    ) -> list[SearchResult]:
        """Get recent news articles about a company."""
        query = f"{company_name} news recent developments 2024"
        response = await self.search(
            query,
            search_depth="advanced",
            max_results=max_results,
            exclude_domains=["wikipedia.org"]  # Exclude static sources for news
        )
        return response.results


# Utility function for formatting results for LLM consumption
def format_results_for_llm(results_by_section: dict) -> str:
    """Format search results into a string for LLM processing."""
    output = []
    
    for section, queries in results_by_section.items():
        output.append(f"\n## {section}\n")
        
        for q in queries:
            if q.get("answer"):
                output.append(f"**Summary:** {q['answer']}\n")
            
            output.append("**Sources:**")
            for r in q.get("results", [])[:3]:  # Top 3 per query
                output.append(f"- [{r['title']}]({r['url']})")
                if r.get("content"):
                    # Truncate content
                    content = r["content"][:500] + "..." if len(r["content"]) > 500 else r["content"]
                    output.append(f"  {content}")
                if r.get("date"):
                    output.append(f"  *Published: {r['date']}*")
            output.append("")
    
    return "\n".join(output)