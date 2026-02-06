"""Magic link authentication models."""
from datetime import datetime, timedelta
from sqlalchemy import Column, String, DateTime, Boolean, Index
import uuid

from app.models.models import Base

class MagicLink(Base):
    """Magic link for passwordless authentication."""
    __tablename__ = "magic_links"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), nullable=False, index=True)
    token = Column(String(255), nullable=False, unique=True, index=True)
    one_time_code = Column(String(10), nullable=True)  # New field for one-time code
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    used_at = Column(DateTime, nullable=True)
    
    def is_expired(self) -> bool:
        """Check if magic link is expired."""
        return datetime.utcnow() > self.expires_at
    
    def is_valid(self) -> bool:
        """Check if magic link is valid (not used and not expired)."""
        return not self.is_used and not self.is_expired()
    
    def verify_code(self, code: str) -> bool:
        """Verify one-time code."""
        return self.one_time_code and self.one_time_code.upper() == code.upper()
    
    __table_args__ = (
        Index('idx_magic_links_email_token', 'email', 'token'),
        Index('idx_magic_links_expires', 'expires_at'),
    )
