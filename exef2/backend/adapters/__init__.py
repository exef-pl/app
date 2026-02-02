"""
EXEF Adapters - Base Interface

Each adapter implements pull (import) and/or push (export) operations.
"""
from abc import ABC, abstractmethod
from typing import Optional
from pydantic import BaseModel
from datetime import datetime


class AdapterResult(BaseModel):
    """Result of adapter operation"""
    success: bool
    count: int = 0
    documents: list[dict] = []
    errors: list[str] = []
    metadata: dict = {}


class BaseAdapter(ABC):
    """Base adapter interface"""
    
    name: str = "base"
    supports_pull: bool = False
    supports_push: bool = False
    
    def __init__(self, config: dict):
        self.config = config
        self.last_sync: Optional[datetime] = None
    
    async def pull(self) -> AdapterResult:
        """Pull documents from source"""
        if not self.supports_pull:
            return AdapterResult(success=False, errors=["Pull not supported"])
        return await self._pull()
    
    async def push(self, documents: list[dict]) -> AdapterResult:
        """Push documents to destination"""
        if not self.supports_push:
            return AdapterResult(success=False, errors=["Push not supported"])
        return await self._push(documents)
    
    @abstractmethod
    async def _pull(self) -> AdapterResult:
        """Implementation of pull operation"""
        pass
    
    @abstractmethod
    async def _push(self, documents: list[dict]) -> AdapterResult:
        """Implementation of push operation"""
        pass
    
    async def test_connection(self) -> bool:
        """Test if connection to service is working"""
        return True
    
    def get_status(self) -> dict:
        """Get adapter status info"""
        return {
            "name": self.name,
            "supports_pull": self.supports_pull,
            "supports_push": self.supports_push,
            "last_sync": self.last_sync.isoformat() if self.last_sync else None,
            "config_valid": self._validate_config()
        }
    
    def _validate_config(self) -> bool:
        """Validate adapter configuration"""
        return True


# Adapter registry
_adapters: dict[str, type[BaseAdapter]] = {}


def register_adapter(name: str):
    """Decorator to register an adapter"""
    def decorator(cls: type[BaseAdapter]):
        cls.name = name
        _adapters[name] = cls
        return cls
    return decorator


def get_adapter(adapter_type: str, config: dict) -> BaseAdapter:
    """Get adapter instance by type"""
    if adapter_type not in _adapters:
        raise ValueError(f"Unknown adapter: {adapter_type}")
    return _adapters[adapter_type](config)


def list_adapters() -> list[str]:
    """List registered adapters"""
    return list(_adapters.keys())


# Import all adapter modules to register them
from . import ksef
from . import email
from . import export
from . import categorize
from . import ocr
