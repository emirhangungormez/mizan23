"""
Retry Mechanism with Exponential Backoff

Features:
- Configurable retry attempts
- Exponential backoff with jitter
- Specific exception handling
- Circuit breaker pattern support
- Async support
"""

import time
import random
import asyncio
from functools import wraps
from typing import Callable, Tuple, Type, Optional, Any, TypeVar, Union
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import threading

from .logger import logger

T = TypeVar('T')


class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, reject calls
    HALF_OPEN = "half_open"  # Testing if service recovered


@dataclass
class RetryConfig:
    """Configuration for retry behavior"""
    max_attempts: int = 3
    base_delay: float = 1.0  # seconds
    max_delay: float = 60.0  # seconds
    exponential_base: float = 2.0
    jitter: bool = True
    jitter_range: Tuple[float, float] = (0.5, 1.5)
    
    # Exceptions to retry on (empty = all exceptions)
    retry_on: Tuple[Type[Exception], ...] = (Exception,)
    
    # Exceptions to NOT retry on
    dont_retry_on: Tuple[Type[Exception], ...] = ()


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker"""
    failure_threshold: int = 5  # failures before opening
    recovery_timeout: float = 30.0  # seconds before half-open
    success_threshold: int = 2  # successes in half-open to close


class CircuitBreaker:
    """
    Circuit Breaker implementation for external service protection
    
    States:
    - CLOSED: Normal operation, requests go through
    - OPEN: Too many failures, requests immediately fail
    - HALF_OPEN: Testing recovery, limited requests allowed
    """
    
    def __init__(self, name: str, config: Optional[CircuitBreakerConfig] = None):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: Optional[datetime] = None
        self._lock = threading.Lock()
    
    @property
    def state(self) -> CircuitState:
        with self._lock:
            if self._state == CircuitState.OPEN:
                # Check if recovery timeout has passed
                if self._last_failure_time:
                    elapsed = (datetime.now() - self._last_failure_time).total_seconds()
                    if elapsed >= self.config.recovery_timeout:
                        self._state = CircuitState.HALF_OPEN
                        self._success_count = 0
                        logger.info(f"Circuit '{self.name}' entering HALF_OPEN state")
            return self._state
    
    def record_success(self):
        """Record a successful call"""
        with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                if self._success_count >= self.config.success_threshold:
                    self._state = CircuitState.CLOSED
                    self._failure_count = 0
                    logger.info(f"Circuit '{self.name}' CLOSED - service recovered")
            else:
                self._failure_count = 0
    
    def record_failure(self):
        """Record a failed call"""
        with self._lock:
            self._failure_count += 1
            self._last_failure_time = datetime.now()
            
            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.OPEN
                logger.warning(f"Circuit '{self.name}' OPEN - failure in half-open")
            elif self._failure_count >= self.config.failure_threshold:
                self._state = CircuitState.OPEN
                logger.warning(f"Circuit '{self.name}' OPEN - threshold reached ({self._failure_count} failures)")
    
    def can_execute(self) -> bool:
        """Check if a call can be executed"""
        state = self.state  # This also handles timeout transitions
        return state != CircuitState.OPEN
    
    def reset(self):
        """Manually reset the circuit breaker"""
        with self._lock:
            self._state = CircuitState.CLOSED
            self._failure_count = 0
            self._success_count = 0
            self._last_failure_time = None


# Global circuit breakers for external services
_circuit_breakers: dict[str, CircuitBreaker] = {}
_cb_lock = threading.Lock()


def get_circuit_breaker(name: str, config: Optional[CircuitBreakerConfig] = None) -> CircuitBreaker:
    """Get or create a circuit breaker by name"""
    with _cb_lock:
        if name not in _circuit_breakers:
            _circuit_breakers[name] = CircuitBreaker(name, config)
        return _circuit_breakers[name]


def calculate_delay(attempt: int, config: RetryConfig) -> float:
    """Calculate delay for a retry attempt with exponential backoff"""
    delay = config.base_delay * (config.exponential_base ** (attempt - 1))
    delay = min(delay, config.max_delay)
    
    if config.jitter:
        jitter_factor = random.uniform(*config.jitter_range)
        delay *= jitter_factor
    
    return delay


def retry(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    jitter: bool = True,
    retry_on: Tuple[Type[Exception], ...] = (Exception,),
    dont_retry_on: Tuple[Type[Exception], ...] = (),
    circuit_breaker: Optional[str] = None
):
    """
    Decorator for automatic retry with exponential backoff
    
    Usage:
        @retry(max_attempts=3, base_delay=1.0)
        def fetch_data(url):
            ...
        
        @retry(max_attempts=5, retry_on=(ConnectionError, TimeoutError))
        def api_call():
            ...
    """
    config = RetryConfig(
        max_attempts=max_attempts,
        base_delay=base_delay,
        max_delay=max_delay,
        exponential_base=exponential_base,
        jitter=jitter,
        retry_on=retry_on,
        dont_retry_on=dont_retry_on
    )
    
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs) -> T:
            # Get circuit breaker if specified
            cb = get_circuit_breaker(circuit_breaker) if circuit_breaker else None
            
            # Check circuit breaker
            if cb and not cb.can_execute():
                raise RuntimeError(f"Circuit breaker '{circuit_breaker}' is OPEN")
            
            last_exception = None
            
            for attempt in range(1, config.max_attempts + 1):
                try:
                    result = func(*args, **kwargs)
                    
                    # Record success
                    if cb:
                        cb.record_success()
                    
                    return result
                    
                except config.dont_retry_on as e:
                    # Don't retry these exceptions
                    logger.error(f"[Retry] {func.__name__} - non-retryable error: {e}")
                    if cb:
                        cb.record_failure()
                    raise
                    
                except config.retry_on as e:
                    last_exception = e
                    
                    if attempt == config.max_attempts:
                        logger.error(
                            f"[Retry] {func.__name__} - all {config.max_attempts} attempts failed",
                            error=str(e)
                        )
                        if cb:
                            cb.record_failure()
                        raise
                    
                    delay = calculate_delay(attempt, config)
                    logger.warning(
                        f"[Retry] {func.__name__} - attempt {attempt}/{config.max_attempts} failed, "
                        f"retrying in {delay:.2f}s",
                        error=str(e)
                    )
                    time.sleep(delay)
            
            # Should never reach here, but just in case
            raise last_exception
        
        return wrapper
    return decorator


def async_retry(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    jitter: bool = True,
    retry_on: Tuple[Type[Exception], ...] = (Exception,),
    dont_retry_on: Tuple[Type[Exception], ...] = (),
    circuit_breaker: Optional[str] = None
):
    """
    Async version of retry decorator
    
    Usage:
        @async_retry(max_attempts=3)
        async def fetch_data_async(url):
            ...
    """
    config = RetryConfig(
        max_attempts=max_attempts,
        base_delay=base_delay,
        max_delay=max_delay,
        exponential_base=exponential_base,
        jitter=jitter,
        retry_on=retry_on,
        dont_retry_on=dont_retry_on
    )
    
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            cb = get_circuit_breaker(circuit_breaker) if circuit_breaker else None
            
            if cb and not cb.can_execute():
                raise RuntimeError(f"Circuit breaker '{circuit_breaker}' is OPEN")
            
            last_exception = None
            
            for attempt in range(1, config.max_attempts + 1):
                try:
                    result = await func(*args, **kwargs)
                    
                    if cb:
                        cb.record_success()
                    
                    return result
                    
                except config.dont_retry_on as e:
                    logger.error(f"[AsyncRetry] {func.__name__} - non-retryable error: {e}")
                    if cb:
                        cb.record_failure()
                    raise
                    
                except config.retry_on as e:
                    last_exception = e
                    
                    if attempt == config.max_attempts:
                        logger.error(
                            f"[AsyncRetry] {func.__name__} - all {config.max_attempts} attempts failed",
                            error=str(e)
                        )
                        if cb:
                            cb.record_failure()
                        raise
                    
                    delay = calculate_delay(attempt, config)
                    logger.warning(
                        f"[AsyncRetry] {func.__name__} - attempt {attempt}/{config.max_attempts} failed, "
                        f"retrying in {delay:.2f}s",
                        error=str(e)
                    )
                    await asyncio.sleep(delay)
            
            raise last_exception
        
        return wrapper
    return decorator


# Pre-configured retry decorators for common use cases

def retry_api_call(func):
    """Pre-configured retry for API calls"""
    return retry(
        max_attempts=3,
        base_delay=1.0,
        retry_on=(ConnectionError, TimeoutError, OSError),
        circuit_breaker="api"
    )(func)


def retry_database(func):
    """Pre-configured retry for database operations"""
    return retry(
        max_attempts=3,
        base_delay=0.5,
        max_delay=5.0,
        circuit_breaker="database"
    )(func)


def retry_external_service(service_name: str):
    """Pre-configured retry for external services"""
    return retry(
        max_attempts=5,
        base_delay=2.0,
        max_delay=30.0,
        circuit_breaker=service_name
    )
