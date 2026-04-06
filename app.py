from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from google import genai
import os
from dotenv import load_dotenv
from typing import List, Optional
import json

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file")

client = genai.Client(api_key=API_KEY)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: Optional[str] = None
    messages: Optional[List["ChatMessage"]] = None
    role_prompts: Optional[List["RolePrompt"]] = None


class ChatMessage(BaseModel):
    role: str
    text: str


class RolePrompt(BaseModel):
    id: str
    name: str
    prompt: str


def build_contents(messages: List[ChatMessage]):
    contents = []

    for message in messages:
        role = "model" if message.role == "bot" else "user"
        contents.append(
            {
                "role": role,
                "parts": [{"text": message.text}],
            }
        )

    return contents


def extract_latest_user_message(messages: List[ChatMessage]) -> str:
    for message in reversed(messages):
        if message.role == "user":
            return message.text
    return ""


def choose_role_for_message(
    latest_user_message: str, role_prompts: Optional[List[RolePrompt]]
) -> Optional[RolePrompt]:
    if not latest_user_message.strip() or not role_prompts:
        return None

    role_catalog = "\n".join(
        [f"- id: {role.id}, name: {role.name}" for role in role_prompts]
    )

    selection_prompt = f"""
You are a role router for a chatbot.

Choose the best matching role for the user message from the given catalog.
If no role clearly fits, return "general".

Role catalog:
{role_catalog}

User message:
{latest_user_message}

Return ONLY valid JSON in this exact shape:
{{"role_id":"<role id or general>"}}
""".strip()

    try:
        selection_response = client.models.generate_content(
            model="gemini-3-flash-preview", contents=selection_prompt
        )
        parsed = json.loads(selection_response.text)
        selected_role_id = parsed.get("role_id")
    except Exception:
        return None

    if not selected_role_id or selected_role_id == "general":
        return None

    return next((role for role in role_prompts if role.id == selected_role_id), None)


@app.post("/chat")
async def chat(req: ChatRequest):
    try:
        selected_role = None

        if req.messages:
            selected_role = choose_role_for_message(
                latest_user_message=extract_latest_user_message(req.messages),
                role_prompts=req.role_prompts,
            )
            contents = build_contents(req.messages)

            if selected_role:
                contents = [
                    {
                        "role": "user",
                        "parts": [
                            {
                                "text": (
                                    "Use this role instruction for your responses in this"
                                    " conversation unless the user asks to change topics:\n"
                                    f"{selected_role.prompt}"
                                )
                            }
                        ],
                    },
                    *contents,
                ]
        elif req.message:
            contents = req.message
        else:
            return {"reply": "Error: No message provided"}

        response = client.models.generate_content(
            model="gemini-3-flash-preview", contents=contents
        )
        return {
            "reply": response.text,
            "selected_role_id": selected_role.id if selected_role else None,
            "selected_role_name": selected_role.name if selected_role else "General",
        }
    except Exception as e:
        return {"reply": f"Error: {str(e)}"}
