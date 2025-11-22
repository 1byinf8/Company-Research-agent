"""
Async Gemini API client for the research agent.
"""
import aiohttp
import asyncio
import json
import re
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
        max_tokens: int = 8192,
        response_mime_type: Optional[str] = None
    ) -> GeminiResponse:
        """Generate a response from Gemini."""
        url = f"{self.base_url}/models/{self.model}:generateContent?key={self.api_key}"
        
        contents = []
        if system_prompt:
            contents.append({"role": "user", "parts": [{"text": f"System: {system_prompt}"}]})
            contents.append({"role": "model", "parts": [{"text": "Understood. I will follow these instructions."}]})
        contents.append({"role": "user", "parts": [{"text": prompt}]})
        
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
        
        if response_mime_type:
            payload["generationConfig"]["responseMimeType"] = response_mime_type
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    error = await response.text()
                    raise Exception(f"Gemini API error: {response.status} - {error}")
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
    
    def _clean_json_string(self, text: str) -> str:
        """Clean and extract JSON from response text."""
        text = text.strip()
        
        # Remove markdown code blocks
        if "```json" in text:
            text = text.split("```json", 1)[1]
            if "```" in text:
                text = text.split("```", 1)[0]
        elif "```" in text:
            parts = text.split("```")
            if len(parts) >= 2:
                text = parts[1]
        
        text = text.strip()
        
        # Find JSON object boundaries
        start = text.find('{')
        if start == -1:
            start = text.find('[')
        
        if start == -1:
            return text
        
        # Find matching closing bracket
        bracket_type = text[start]
        close_bracket = '}' if bracket_type == '{' else ']'
        
        depth = 0
        end = start
        in_string = False
        escape_next = False
        
        for i, char in enumerate(text[start:], start):
            if escape_next:
                escape_next = False
                continue
            if char == '\\':
                escape_next = True
                continue
            if char == '"' and not escape_next:
                in_string = not in_string
                continue
            if in_string:
                continue
            if char == bracket_type:
                depth += 1
            elif char == close_bracket:
                depth -= 1
                if depth == 0:
                    end = i
                    break
        
        return text[start:end + 1]
    
    def _fix_common_json_errors(self, json_str: str) -> str:
        """Fix common JSON formatting errors."""
        # Remove trailing commas before closing brackets
        json_str = re.sub(r',\s*}', '}', json_str)
        json_str = re.sub(r',\s*]', ']', json_str)
        
        # Fix unescaped quotes in strings (basic)
        # This is tricky, so we only do simple cases
        
        # Remove control characters
        json_str = re.sub(r'[\x00-\x1f\x7f-\x9f]', ' ', json_str)
        
        # Fix common issues with newlines in strings
        lines = json_str.split('\n')
        fixed_lines = []
        for line in lines:
            # Remove lines that are just whitespace inside strings
            fixed_lines.append(line)
        json_str = '\n'.join(fixed_lines)
        
        return json_str
    
    async def generate_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.3,
        retries: int = 3
    ) -> dict:
        """Generate and parse JSON response with robust error handling."""
        last_error = None
        
        json_instruction = """

CRITICAL: Respond with ONLY a valid JSON object. 
- Do NOT include any text before or after the JSON
- Do NOT use markdown code blocks
- Ensure all strings are properly escaped
- Do NOT include trailing commas
- Use double quotes for all strings and keys"""
        
        for attempt in range(retries + 1):
            try:
                use_json_mode = attempt < 2
                
                response = await self.generate(
                    prompt=prompt + json_instruction,
                    system_prompt=system_prompt,
                    temperature=temperature,
                    max_tokens=8192,
                    response_mime_type="application/json" if use_json_mode else None
                )
                
                text = response.text.strip()
                
                if not text:
                    if attempt < retries:
                        await asyncio.sleep(0.5)
                        continue
                    raise ValueError("Empty response from API")
                
                # Try direct parse first
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    pass
                
                # Clean and extract JSON
                cleaned = self._clean_json_string(text)
                
                try:
                    return json.loads(cleaned)
                except json.JSONDecodeError:
                    pass
                
                # Try fixing common errors
                fixed = self._fix_common_json_errors(cleaned)
                
                try:
                    return json.loads(fixed)
                except json.JSONDecodeError as e:
                    last_error = e
                    if attempt < retries:
                        await asyncio.sleep(0.5)
                        continue
                    
            except Exception as e:
                last_error = e
                if attempt < retries:
                    await asyncio.sleep(0.5)
                    continue
        
        raise ValueError(f"Failed to parse JSON after {retries + 1} attempts. Last error: {last_error}")
    
    async def generate_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7
    ) -> AsyncGenerator[str, None]:
        """Stream response tokens from Gemini."""
        url = f"{self.base_url}/models/{self.model}:streamGenerateContent?key={self.api_key}"
        
        contents = []
        if system_prompt:
            contents.append({"role": "user", "parts": [{"text": f"System: {system_prompt}"}]})
            contents.append({"role": "model", "parts": [{"text": "Understood."}]})
        contents.append({"role": "user", "parts": [{"text": prompt}]})
        
        payload = {"contents": contents, "generationConfig": {"temperature": temperature}}
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    raise Exception(f"Gemini stream error: {response.status}")
                
                buffer = ""
                async for chunk in response.content:
                    buffer += chunk.decode('utf-8')
                    while True:
                        try:
                            if buffer.startswith('['):
                                buffer = buffer[1:]
                            if buffer.startswith(','):
                                buffer = buffer[1:]
                            
                            end_idx = buffer.find('}')
                            if end_idx == -1:
                                break
                            
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
        messages: list[dict],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7
    ) -> GeminiResponse:
        """Multi-turn chat completion."""
        url = f"{self.base_url}/models/{self.model}:generateContent?key={self.api_key}"
        
        contents = []
        if system_prompt:
            contents.append({"role": "user", "parts": [{"text": f"System: {system_prompt}"}]})
            contents.append({"role": "model", "parts": [{"text": "Understood. I'll follow these instructions."}]})
        
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})
        
        payload = {"contents": contents, "generationConfig": {"temperature": temperature}}
        
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