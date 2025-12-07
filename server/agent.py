import os
from typing import Dict, List, Optional
from langchain_redis import RedisVectorStore
from langchain_classic.schema import Document
from langchain_openai import OpenAIEmbeddings
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy
from langgraph.checkpoint.redis import RedisSaver
from pydantic import BaseModel, Field
from redis import Redis
from googleapiclient.discovery import build
import os
import base64
from email.message import EmailMessage
from typing import List, Optional

# Google Auth Imports
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

REDIS_URL = "redis://localhost:6379"
REDIS_CLIENT = Redis.from_url(REDIS_URL)
EMBEDDINGS = OpenAIEmbeddings()
VECTOR_STORE = RedisVectorStore(embeddings=EMBEDDINGS)
MIN_SIMILARITY_SCORE = 0.75 

def get_context(s: str) -> List[Document]:
    results_with_scores = VECTOR_STORE.similarity_search_with_score(s, k=10) # Ask for more initially

    filtered_documents = [
        doc for doc, score in results_with_scores if score >= MIN_SIMILARITY_SCORE
    ]

    return filtered_documents

def get_prompt_context(query: str) -> str:
    """Gets information from a query that will be useful to include in a response, always call this function"""

    retrieved_documents = get_context(query)
    
    context_strings = []
    
    for doc in retrieved_documents:
        source = doc.metadata.get("source", "unknown source")
        content = doc.page_content
        context_strings.append(f"Source: {source}\nContent: {content}\n---")
        
    return "\n".join(context_strings)

def update_vector_store(id: str, text: str):
  VECTOR_STORE.delete(
      ids=[id]
  )

  document_chunk = Document(
      page_content=text,
      metadata={
          "doc_id": id,
          "source": "source",
          "type": "memo"
      }
  )

  documents_to_add = [document_chunk]
  VECTOR_STORE.add_documents(documents_to_add, ids=[id])


class Agent:
  def action(self, text: str) -> Optional[str]:
    return None

@dataclass
class ResponseFormatMessage:
    helpful_response: str

class MessageAgent(Agent):
  def __init__(self, system_prompt = "You are a helpful assistant"):
    checkpointer = RedisSaver(redis_client=REDIS_CLIENT)
    checkpointer.setup() 

    self.agent = create_agent(
      model="gpt-4.1", 
      tools=[get_prompt_context],
      system_prompt=system_prompt,
      response_format=ToolStrategy(ResponseFormatMessage),
      checkpointer=checkpointer,
    )

  def action(self, text: str) -> Optional[str]:
    response = self.agent.invoke(
      {"messages": [{"role": "user", "content": text}]},
      config={"configurable": {"thread_id": 0}} 
    )["structured_response"]

    return response.helpful_response

class TodoListAgent(Agent):
  def __init__(self, system_prompt = "You are a unhelpful assistant"):
    checkpointer = RedisSaver(redis_client=REDIS_CLIENT)
    checkpointer.setup() 

    self.agent = create_agent(
      model="gpt-4.1", 
      tools=[get_prompt_context],
      system_prompt=system_prompt,
      response_format=ToolStrategy(ResponseFormatMessage),
      checkpointer=checkpointer,
    )

  def action(self, text: str) -> Optional[str]:
    response = self.agent.invoke(
      {"messages": [{"role": "user", "content": text}]},
      config={"configurable": {"thread_id": 0}} 
    )["structured_response"]

    return response.agent
  

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]

def get_gmail_service():
    """Handles OAuth2 authentication and returns the Gmail service."""
    creds = None
    # 1. Check if token already exists
    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)
    
    # 2. If no valid token, let user log in
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            # Requires credentials.json from Google Cloud Console
            if not os.path.exists("credentials.json"):
                raise FileNotFoundError("Could not find 'credentials.json'. Please download it from Google Cloud Console.")
            
            flow = InstalledAppFlow.from_client_secrets_file(
                "credentials.json", SCOPES
            )
            # This will open a browser window for you to login
            creds = flow.run_local_server(port=0)
            
        # 3. Save the new token
        with open("token.json", "w") as token:
            token.write(creds.to_json())

    return build("gmail", "v1", credentials=creds)

class RouterChoice(BaseModel):
    chosen_agent: str = Field(
        description="The exact single word name of the most appropriate agent for the query."
    )

class ChoiceAgent(Agent):
  def __init__(self, agents: Dict[str, str]):
    checkpointer = RedisSaver(redis_client=REDIS_CLIENT)
    checkpointer.setup()

    agent_names = list(agents.keys())
    agents_list_str = ', '.join(agent_names)

    description_lines = []
    for name, description in agents.items():
        description_lines.append(f"- **{name}**: {description}")
    
    agents_description_str = '\n'.join(description_lines)

    self.agent = create_agent(
        model="gpt-4.1", 
        tools=[get_prompt_context],
        system_prompt=(
            "You are a highly efficient **Agent Router and Classifier**. "
            "Your sole task is to determine the most appropriate agent for a given user query. "

            "--"
            "**CRITICAL RULE: Before making ANY routing decision, you MUST call the `get_prompt_context` tool to retrieve necessary contextual data.** "
            "The retrieved context is essential for accurate routing. "
            "---"
            
            f"The available agents and their descriptions are:\n{agents_description_str}\n"
            "---"

            f"Your only available choices are: **{agents_list_str}**. "
            "**Strictly adhere to the following output rules:** "
            "1. **Analyze** the user input. "
            "2. **Respond with ONLY the exact, single word name** of the chosen agent. "
            "3. **DO NOT** include any other text, punctuation, explanation, or conversational filler."
            f"Chosen Agent: **{agent_names[1]}**" 
        ),    
        response_format=ToolStrategy(RouterChoice),
        checkpointer=checkpointer,
    )

  def action(self, text: str) -> Optional[str]:
    response = self.agent.invoke(
      {"messages": [{"role": "user", "content": text}]},
      config={"configurable": {"thread_id": 0}} 
    )["structured_response"]

    return response.chosen_agent

def send_email(
    to: List[str],
    subject: str,
    body: str,
    cc: Optional[List[str]] = None
) -> str:
    """
    Use this tool to send an email via Gmail API.

    Args:
        to: A list of email strings (e.g. ["alice@example.com"]).
            MUST be a list.
        subject: The subject line of the email.
        body: The plain text body of the email.
        cc: (Optional) A list of email strings for CC.

    Returns:
        A string indicating success or failure.
    """
    if cc is None:
        cc = []

    try:
        service = get_gmail_service()
        message = EmailMessage()
        message.set_content(body)
        message["To"] = ", ".join(to)
        message["From"] = "me"
        message["Subject"] = subject

        if cc:
            message["Cc"] = ", ".join(cc)

        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        create_message = {"raw": encoded_message}
        sent_message = (
            service.users()
            .messages()
            .send(userId="me", body=create_message)
            .execute()
        )

        return f"Email sent successfully! Message Id: {sent_message['id']}"

    except HttpError as error:
        return f"An API error occurred: {error}"
    except Exception as e:
        return f"An unexpected error occurred: {e}"

class EmailCalendarAgent(Agent):
    def __init__(self):
      checkpointer = RedisSaver(redis_client=REDIS_CLIENT)
      checkpointer.setup()

      self.service = get_gmail_service()
      self.agent = create_agent(
            model="gpt-4.1", 
            tools=[get_prompt_context, send_email],
            system_prompt="You are a helpful assistant. You can schedule calendar events and send emails. Break down user requests into appropriate tool calls and coordinate the results."
                          "When a request involves multiple actions, use multiple tools in sequence.",
            response_format=ToolStrategy(ResponseFormatMessage),
            checkpointer=checkpointer,
          )

    def action(self, text: str) -> Optional[str]:
      response = self.agent.invoke(
        {"messages": [{"role": "user", "content": text}]},
        config={"configurable": {"thread_id": 0}} 
      )["structured_response"]

      return response.helpful_response