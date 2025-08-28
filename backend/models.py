# PostgreSQL Database Models for ChatBook
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Message(Base):
    __tablename__ = 'messages'
    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey('users.id'))
    receiver_id = Column(Integer, ForeignKey('users.id'))
    content = Column(Text, nullable=False)
    status = Column(String, default="sent")  # sent, delivered, seen
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    sender = relationship('User', foreign_keys=[sender_id])
    receiver = relationship('User', foreign_keys=[receiver_id])

class CallLog(Base):
    __tablename__ = 'call_logs'
    id = Column(Integer, primary_key=True, index=True)
    caller_id = Column(Integer, ForeignKey('users.id'))
    receiver_id = Column(Integer, ForeignKey('users.id'))
    call_time = Column(DateTime, default=datetime.datetime.utcnow)
    duration = Column(Integer)  # Duration in seconds
    caller = relationship('User', foreign_keys=[caller_id])
    receiver = relationship('User', foreign_keys=[receiver_id])
