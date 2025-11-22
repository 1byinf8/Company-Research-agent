"""
Test script to verify the agent works correctly.
Run this to test all components before building the API layer.
"""
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

# Ensure API keys are set
assert os.getenv("GEMINI_API_KEY"), "Set GEMINI_API_KEY in .env"
assert os.getenv("TAVILY_API_KEY"), "Set TAVILY_API_KEY in .env"

from ai_agent.agent import ResearchAgent


async def test_confused_user():
    """Test: Confused user who doesn't know what they want."""
    print("\n" + "="*60)
    print("TEST 1: Confused User")
    print("="*60)
    
    agent = ResearchAgent()
    session_id = agent.memory.create_session()
    
    messages = [
        "um... hi, I need to do some research I think?",
        "I'm not sure, maybe something about tech companies?",
        "Stripe sounds interesting"
    ]
    
    for msg in messages:
        print(f"\n👤 User: {msg}")
        async for response in agent.chat(session_id, msg):
            if response["type"] == "message":
                print(f"🤖 Agent: {response['content']}")
            elif response["type"] == "status":
                print(f"   ⏳ {response['message']}")
            elif response["type"] == "intent":
                print(f"   [Intent: {response['intent']}]")


async def test_efficient_user():
    """Test: Efficient user who wants quick results."""
    print("\n" + "="*60)
    print("TEST 2: Efficient User")
    print("="*60)
    
    agent = ResearchAgent()
    session_id = agent.memory.create_session()
    
    # Store focus area
    agent.memory.set_user_context(session_id, "focus_area", "enterprise sales")
    
    msg = "Account plan for Notion, focus on enterprise sales angle"
    print(f"\n👤 User: {msg}")
    
    async for response in agent.chat(session_id, msg):
        if response["type"] == "message":
            print(f"🤖 Agent: {response['content']}")
        elif response["type"] == "status":
            print(f"   ⏳ [{response.get('progress', 0)}%] {response['message']}")
        elif response["type"] == "research_update":
            print(f"   📊 Found info on: {response['section']}")
        elif response["type"] == "conflicts":
            print(f"   ⚠️ Conflicts found: {len(response['conflicts'])}")
        elif response["type"] == "plan_complete":
            print(f"   ✅ Plan generated!")
            # Print summary
            plan = response["plan"]
            print(f"\n   Company: {plan['overview']['name']}")
            print(f"   Industry: {plan['overview'].get('industry', 'N/A')}")


async def test_chatty_user():
    """Test: Chatty user who goes off-topic."""
    print("\n" + "="*60)
    print("TEST 3: Chatty User")
    print("="*60)
    
    agent = ResearchAgent()
    session_id = agent.memory.create_session()
    
    messages = [
        "Hey! So I was thinking about Salesforce, reminds me of when I worked there back in 2015, crazy times honestly, the office had this amazing coffee machine...",
        "Oh yeah sorry, so what can you tell me about them now?",
        "That's cool. Hey random question - what's the best pizza in NYC?"
    ]
    
    for msg in messages:
        print(f"\n👤 User: {msg}")
        async for response in agent.chat(session_id, msg):
            if response["type"] == "message":
                print(f"🤖 Agent: {response['content']}")
            elif response["type"] == "intent":
                print(f"   [Intent: {response['intent']}]")


async def test_edit_section():
    """Test: User editing a section of the plan."""
    print("\n" + "="*60)
    print("TEST 4: Section Editing")
    print("="*60)
    
    agent = ResearchAgent()
    session_id = agent.memory.create_session()
    
    # First, do research
    print("\n👤 User: Research Figma quickly")
    async for response in agent.chat(session_id, "Research Figma"):
        if response["type"] == "status":
            print(f"   ⏳ {response['message']}")
        elif response["type"] == "plan_complete":
            print("   ✅ Initial plan generated")
    
    # Then edit
    edit_msg = "Add more detail to the competitors section, especially about Adobe"
    print(f"\n👤 User: {edit_msg}")
    
    async for response in agent.chat(session_id, edit_msg):
        if response["type"] == "message":
            print(f"🤖 Agent: {response['content']}")
        elif response["type"] == "section_updated":
            print(f"   ✅ Section '{response['section']}' updated")
            print(f"   New content preview: {str(response['content'])[:200]}...")


async def test_edge_cases():
    """Test: Edge cases and invalid inputs."""
    print("\n" + "="*60)
    print("TEST 5: Edge Cases")
    print("="*60)
    
    agent = ResearchAgent()
    session_id = agent.memory.create_session()
    
    edge_cases = [
        "",  # Empty input
        "asdfghjkl",  # Gibberish
        "Research Google Microsoft Apple Amazon all at once",  # Multiple companies
        "Generate plan",  # No research done yet
        "Edit the overview",  # No plan exists
    ]
    
    for msg in edge_cases:
        print(f"\n👤 User: '{msg}'")
        try:
            async for response in agent.chat(session_id, msg or "(empty)"):
                if response["type"] == "message":
                    print(f"🤖 Agent: {response['content'][:200]}...")
                elif response["type"] == "error":
                    print(f"   ❌ Error: {response['message']}")
                elif response["type"] == "intent":
                    print(f"   [Intent: {response['intent']}]")
        except Exception as e:
            print(f"   ❌ Exception: {e}")


async def interactive_demo():
    """Interactive demo mode - chat with the agent."""
    print("\n" + "="*60)
    print("INTERACTIVE DEMO")
    print("Type 'quit' to exit")
    print("="*60)
    
    agent = ResearchAgent()
    session_id = agent.memory.create_session()
    
    while True:
        user_input = input("\n👤 You: ").strip()
        if user_input.lower() == 'quit':
            break
        
        if not user_input:
            continue
        
        async for response in agent.chat(session_id, user_input):
            if response["type"] == "message":
                print(f"\n🤖 Agent: {response['content']}")
            elif response["type"] == "status":
                print(f"   ⏳ [{response.get('progress', 0)}%] {response['message']}")
            elif response["type"] == "research_update":
                print(f"   📊 {response['section']}: {response.get('preview', '')[:100]}...")
            elif response["type"] == "conflicts":
                print(f"\n   ⚠️ Found {len(response['conflicts'])} conflicts:")
                for c in response['conflicts']:
                    print(f"      - {c['topic']}: {c['suggested_resolution']}")
            elif response["type"] == "plan_complete":
                print("\n   ✅ Account Plan Generated!")
                plan = response["plan"]
                print(f"\n   === {plan['company_name']} ===")
                print(f"   {plan['overview'].get('description', 'No description')}")
            elif response["type"] == "section_updated":
                print(f"\n   ✅ Updated: {response['section']}")
            elif response["type"] == "intent":
                pass  # Don't show intent in interactive mode


async def main():
    """Run all tests or interactive demo."""
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--interactive":
        await interactive_demo()
    else:
        print("Running agent tests...\n")
        
        # Run tests sequentially
        await test_confused_user()
        await test_efficient_user()
        await test_chatty_user()
        # await test_edit_section()  # Uncomment to test editing
        # await test_edge_cases()    # Uncomment to test edge cases
        
        print("\n" + "="*60)
        print("All tests completed!")
        print("Run with --interactive for interactive demo")
        print("="*60)


if __name__ == "__main__":
    asyncio.run(main())