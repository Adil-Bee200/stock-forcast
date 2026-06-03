from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T")


@dataclass(frozen=True)
class CacheEntry(Generic[T]):
    data: T
    fetched_at: float


class IntradayCache(Generic[T]):
    """Per-ticker in-memory cache with a minimum interval between upstream fetches."""

    def __init__(self, ttl_seconds: int) -> None:
        self._ttl = max(ttl_seconds, 0)
        self._entries: dict[str, CacheEntry[T]] = {}
        self._lock = threading.Lock()

    def get(self, symbol: str) -> CacheEntry[T] | None:
        sym = symbol.upper()
        with self._lock:
            entry = self._entries.get(sym)
            if entry is None:
                return None
            if self._ttl > 0 and (time.monotonic() - entry.fetched_at) >= self._ttl:
                return None
            return entry

    def get_stale(self, symbol: str) -> CacheEntry[T] | None:
        sym = symbol.upper()
        with self._lock:
            return self._entries.get(sym)

    def set(self, symbol: str, data: T) -> CacheEntry[T]:
        sym = symbol.upper()
        entry = CacheEntry(data=data, fetched_at=time.monotonic())
        with self._lock:
            self._entries[sym] = entry
        return entry

    def should_fetch_upstream(self, symbol: str) -> bool:
        return self.get(symbol) is None
