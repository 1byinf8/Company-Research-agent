"""
Async Gemini API client for the research agent.
"""
import aiohttp
import asyncio
import json
import os
from typing import Optional, AsyncGenerator
from dataclasses import dataclass


@dataclass
class GeminiResponse:
    """Response from Gemini API."""
    text: str
    finish_reason: str
    usage: dict


class GeminiClient:
    """Async client for Google Gemini API."""
    
    def __init__(self, api_key: Optional[str] = None, model: str = "gemini-2.5-flash"):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found")
        
        self.model = model
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
    
    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_mime_type: Optional[str] = None  # "application/json" for JSON mode
    ) -> GeminiResponse:
        """
        Generate a response from Gemini.
        
        Args:
            prompt: User prompt
            system_prompt: System instructions
            temperature: Creativity (0.0-1.0)
            max_tokens: Max response tokens
            response_mime_type: Set to "application/json" for JSON output
        """
        url = f"{self.base_url}/models/{self.model}:generateContent?key={self.api_key}"
        
        contents = []
        
        # Add system instruction if provided
        if system_prompt:
            contents.append({
                "role": "user",
                "parts": [{"text": f"System: {system_prompt}"}]
            })
            contents.append({
                "role": "model", 
                "parts": [{"text": "Understood. I will follow these instructions."}]
            })
        
        # Add user prompt
        contents.append({
            "role": "user",
            "parts": [{"text": prompt}]
        })
        
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
            "safetySettings": [
                {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}
            ]
        }
        
        # Enable JSON mode if requested
        if response_mime_type:
            payload["generationConfig"]["responseMimeType"] = response_mime_type
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    error = await response.text()
                    raise Exception(f"Gemini API error: {response.status} - {error}")
                
                data = await response.json()
        
        # Extract response
        candidate = data.get("candidates", [{}])[0]
        content = candidate.get("content", {})
        parts = content.get("parts", [{}])
        text = parts[0].get("text", "") if parts else ""
        
        return GeminiResponse(
            text=text,
            finish_reason=candidate.get("finishReason", ""),
            usage=data.get("usageMetadata", {})
        )
    
    async def generate_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.3,
        retries: int = 2
    ) -> dict:
        """
        Generate and parse JSON response.
        Automatically retries if JSON parsing fails.
        """
        last_error = None
        
        for attempt in range(retries + 1):
            try:
                # First try with JSON mode
                response = await self.generate(
                    prompt=prompt + "\n\nRespond with ONLY valid JSON, no markdown or extra text.",
                    system_prompt=system_prompt,
                    temperature=temperature,
                    response_mime_type="application/json" if attempt == 0 else None
                )
                
                text = response.text.strip()
                
                # Handle empty response
                if not text:
                    if attempt < retries:
                        continue
                    raise ValueError("Empty response from API")
                
                # Try direct parse
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    pass
                
                # Try to extract JSON from response (might have markdown)
                # Remove markdown code blocks
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0].strip()
                elif "```" in text:
                    text = text.split("```")[1].split("```")[0].strip()
                
                # Find JSON object
                start = text.find('{')
                end = text.rfind('}') + 1
                if start != -1 and end > start:
                    json_str = text[start:end]
                    return json.loads(json_str)
                
                # Find JSON array
                start = text.find('[')
                end = text.rfind(']') + 1
                if start != -1 and end > start:
                    json_str = text[start:end]
                    return json.loads(json_str)
                    
            except Exception as e:
                last_error = e
                if attempt < retries:
                    await asyncio.sleep(0.5)  # Brief delay before retry
                    continue
        
        raise ValueError(f"Failed to parse JSON after {retries + 1} attempts. Last error: {last_error}")
    
    async def generate_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7
    ) -> AsyncGenerator[str, None]:
        """
        Stream response tokens from Gemini.
        """
        url = f"{self.base_url}/models/{self.model}:streamGenerateContent?key={self.api_key}"
        
        contents = []
        if system_prompt:
            contents.append({
                "role": "user",
                "parts": [{"text": f"System: {system_prompt}"}]
            })
            contents.append({
                "role": "model",
                "parts": [{"text": "Understood."}]
            })
        
        contents.append({
            "role": "user",
            "parts": [{"text": prompt}]
        })
        
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
            }
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    error = await response.text()
                    raise Exception(f"Gemini stream error: {response.status}")
                
                # Process streaming response
                buffer = ""
                async for chunk in response.content:
                    buffer += chunk.decode('utf-8')
                    
                    # Try to parse complete JSON objects from buffer
                    while True:
                        try:
                            # Find complete JSON object
                            if buffer.startswith('['):
                                buffer = buffer[1:]  # Remove leading bracket
                            if buffer.startswith(','):
                                buffer = buffer[1:]  # Remove comma
                            
                            end_idx = buffer.find('}')
                            if end_idx == -1:
                                break
                            
                            # Find matching opening brace
                            depth = 0
                            for i, c in enumerate(buffer):
                                if c == '{':
                                    depth += 1
                                elif c == '}':
                                    depth -= 1
                                    if depth == 0:
                                        json_str = buffer[:i+1]
                                        buffer = buffer[i+1:]
                                        
                                        data = json.loads(json_str)
                                        candidates = data.get("candidates", [])
                                        if candidates:
                                            content = candidates[0].get("content", {})
                                            parts = content.get("parts", [])
                                            if parts:
                                                yield parts[0].get("text", "")
                                        break
                            else:
                                break
                        except json.JSONDecodeError:
                            break
    
    async def chat(
        self,
        messages: list[dict],  # [{"role": "user/model", "content": str}]
        system_prompt: Optional[str] = None,
        temperature: float = 0.7
    ) -> GeminiResponse:
        """
        Multi-turn chat completion.
        
        Args:
            messages: List of {"role": "user" or "model", "content": str}
            system_prompt: System instructions
            temperature: Creativity level
        """
        url = f"{self.base_url}/models/{self.model}:generateContent?key={self.api_key}"
        
        contents = []
        
        # Add system prompt
        if system_prompt:
            contents.append({
                "role": "user",
                "parts": [{"text": f"System: {system_prompt}"}]
            })
            contents.append({
                "role": "model",
                "parts": [{"text": "Understood. I'll follow these instructions."}]
            })
        
        # Add conversation history
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append({
                "role": role,
                "parts": [{"text": msg["content"]}]
            })
        
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
            }
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    error = await response.text()
                    raise Exception(f"Gemini chat error: {response.status} - {error}")
                
                data = await response.json()
        
        candidate = data.get("candidates", [{}])[0]
        content = candidate.get("content", {})
        parts = content.get("parts", [{}])
        text = parts[0].get("text", "") if parts else ""
        
        return GeminiResponse(
            text=text,
            finish_reason=candidate.get("finishReason", ""),
            usage=data.get("usageMetadata", {})
        )