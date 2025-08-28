from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import SessionLocal
from models import User, Message
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
from typing import Optional, Dict
import logging
from fastapi.middleware.cors import CORSMiddleware
from fastapi import WebSocket, WebSocketDisconnect
import json
from fastapi.responses import JSONResponse

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

app = FastAPI()

# configure basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("chatbook")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to your frontend URL in production
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600
)


# Extra middleware: set CORS headers on all responses (helps with some proxies)
@app.middleware("http")
async def add_cors_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS,PUT,DELETE"
    response.headers["Access-Control-Allow-Headers"] = "Authorization,Content-Type"
    return response

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

# --- Utility Functions ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict):
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = data.copy()
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

# --- Schemas ---
class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

# --- Auth Routes ---
@app.post("/register", status_code=201)
def register(user: UserCreate, db: Session = Depends(get_db)):
    if get_user_by_username(db, user.username):
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = get_password_hash(user.password)
    db_user = User(username=user.username, password_hash=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return {"msg": "User registered successfully"}

@app.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = get_user_by_username(db, form_data.username)
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    access_token = create_access_token(data={"sub": user.username})
    refresh_token = create_refresh_token(data={"sub": user.username})
    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


@app.post("/login-json", response_model=Token)
def login_json(payload: dict, db: Session = Depends(get_db)):
    # Accepts JSON {"username": "...", "password": "..."}
    username = payload.get("username")
    password = payload.get("password")
    if not username or not password:
        raise HTTPException(status_code=400, detail="username and password required")
    user = get_user_by_username(db, username)
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    access_token = create_access_token(data={"sub": user.username})
    refresh_token = create_refresh_token(data={"sub": user.username})
    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}

@app.post("/logout")
def logout(request: Request):
    # For stateless JWT, logout is handled on the client by deleting tokens
    return {"msg": "Logout successful. Please delete your tokens on the client."}

@app.post("/refresh-token", response_model=Token)
def refresh_token(refresh_token: str, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token type")
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid refresh token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = get_user_by_username(db, username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access_token = create_access_token(data={"sub": user.username})
    new_refresh_token = create_refresh_token(data={"sub": user.username})
    return {"access_token": access_token, "refresh_token": new_refresh_token, "token_type": "bearer"}

@app.get("/")
def read_root():
    return {"message": "Welcome to ChatBook backend!"}

# In-memory connection manager for demo (for production, use Redis or similar)
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, username: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[username] = websocket
        logger.info(f"WebSocket connected: {username}")

    def disconnect(self, username: str):
        self.active_connections.pop(username, None)
        logger.info(f"WebSocket disconnected: {username}")

    async def send_personal_message(self, message: dict, username: str):
        ws = self.active_connections.get(username)
        if ws:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.exception(f"Failed to send message to {username}: {e}")

manager = ConnectionManager()

@app.websocket("/ws/chat/{username}")
async def chat_websocket(websocket: WebSocket, username: str):
    await manager.connect(username, websocket)
    db = SessionLocal()
    try:
        while True:
            data = await websocket.receive_json()
            logger.info(f"WS recv from {username}: {data}")
            # Expected data: {"to": "otheruser", "content": "..."}
            to_user = data.get("to")
            content = data.get("content")
            if not to_user or not content:
                await websocket.send_json({"error": "Invalid message format."})
                continue
            # Store message in DB with status 'sent'
            sender = db.query(User).filter(User.username == username).first()
            receiver = db.query(User).filter(User.username == to_user).first()
            if not sender or not receiver:
                await websocket.send_json({"error": "User not found."})
                continue
            msg = Message(
                sender_id=sender.id,
                receiver_id=receiver.id,
                content=content,
                status="sent"
            )
            db.add(msg)
            db.commit()
            db.refresh(msg)
            # Send to receiver if online
            await manager.send_personal_message({
                "from": username,
                "content": content,
                "status": "sent",
                "timestamp": msg.timestamp.isoformat(),
                "id": msg.id
            }, to_user)
            # Confirm to sender
            try:
                await websocket.send_json({
                    "to": to_user,
                    "content": content,
                    "status": "sent",
                    "timestamp": msg.timestamp.isoformat(),
                    "id": msg.id
                })
            except Exception as e:
                logger.exception(f"Failed to confirm to sender {username}: {e}")
    except WebSocketDisconnect:
        manager.disconnect(username)
    finally:
        db.close()

# --- Users and Messages API for frontend ---
@app.get("/users")
def get_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [{"username": u.username} for u in users]

@app.get("/messages")
def get_messages(user1: str, user2: str, db: Session = Depends(get_db)):
    user1_obj = db.query(User).filter(User.username == user1).first()
    user2_obj = db.query(User).filter(User.username == user2).first()
    if not user1_obj or not user2_obj:
        return JSONResponse([])
    msgs = db.query(Message).filter(
        ((Message.sender_id == user1_obj.id) & (Message.receiver_id == user2_obj.id)) |
        ((Message.sender_id == user2_obj.id) & (Message.receiver_id == user1_obj.id))
    ).order_by(Message.timestamp.asc()).all()
    return [
        {
            "id": m.id,
            "from": user1 if m.sender_id == user1_obj.id else user2,
            "to": user2 if m.sender_id == user1_obj.id else user1,
            "content": m.content,
            "status": m.status,
            "timestamp": m.timestamp.isoformat(),
        }
        for m in msgs
    ]
