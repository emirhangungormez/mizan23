"""
Professional Logging System for Trade Intelligence

Features:
- Structured logging with JSON support
- File rotation
- Console + File output
- Log levels per module
- Performance timing
- Color-coded console output
"""

import logging
import logging.handlers
import os
import sys
import json
import time
from datetime import datetime
from typing import Optional, Any, Dict
from functools import wraps
from pathlib import Path


# ANSI Color Codes
class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    
    # Log levels
    DEBUG = "\033[36m"      # Cyan
    INFO = "\033[32m"       # Green
    WARNING = "\033[33m"    # Yellow
    ERROR = "\033[31m"      # Red
    CRITICAL = "\033[35m"   # Magenta
    
    # Special
    TIMESTAMP = "\033[90m"  # Gray
    MODULE = "\033[94m"     # Blue


class ColoredFormatter(logging.Formatter):
    """Formatter with color support for console output"""
    
    LEVEL_COLORS = {
        logging.DEBUG: Colors.DEBUG,
        logging.INFO: Colors.INFO,
        logging.WARNING: Colors.WARNING,
        logging.ERROR: Colors.ERROR,
        logging.CRITICAL: Colors.CRITICAL,
    }
    
    def format(self, record: logging.LogRecord) -> str:
        # Add color based on level
        color = self.LEVEL_COLORS.get(record.levelno, Colors.RESET)
        
        # Format timestamp
        timestamp = datetime.fromtimestamp(record.created).strftime("%H:%M:%S")
        
        # Build colored message
        level_str = f"{color}{record.levelname:8}{Colors.RESET}"
        module_str = f"{Colors.MODULE}{record.name:20}{Colors.RESET}"
        time_str = f"{Colors.TIMESTAMP}{timestamp}{Colors.RESET}"
        
        return f"{time_str} | {level_str} | {module_str} | {record.getMessage()}"


class JSONFormatter(logging.Formatter):
    """Formatter for JSON structured logging"""
    
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "module": record.name,
            "message": record.getMessage(),
            "file": record.filename,
            "line": record.lineno,
        }
        
        # Add extra fields if present
        if hasattr(record, 'extra_data'):
            log_data["data"] = record.extra_data
        
        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        return json.dumps(log_data, ensure_ascii=False, default=str)


class TradeLogger:
    """
    Centralized logging for Trade Intelligence system
    
    Usage:
        from engine.utils.logger import logger
        
        logger.info("Market data fetched", symbol="THYAO", count=100)
        logger.error("API failed", error=str(e))
    """
    
    _instance = None
    _initialized = False
    
    # Log directory
    LOG_DIR = Path(__file__).parent.parent.parent / "storage" / "logs"
    
    # Default log level per module
    MODULE_LEVELS = {
        "market_fetch": logging.INFO,
        "cache": logging.DEBUG,
        "api": logging.INFO,
        "portfolio": logging.INFO,
        "analysis": logging.INFO,
        "storage": logging.INFO,
        "maintenance": logging.INFO,
    }
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._loggers: Dict[str, logging.Logger] = {}
        self._setup_logging()
        self._initialized = True
    
    def _setup_logging(self):
        """Initialize logging infrastructure"""
        # Create log directory
        self.LOG_DIR.mkdir(parents=True, exist_ok=True)
        
        # Root logger setup
        root_logger = logging.getLogger("trade_intelligence")
        root_logger.setLevel(logging.DEBUG)
        
        # Remove existing handlers
        root_logger.handlers.clear()
        
        # Console Handler (colored)
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(ColoredFormatter())
        root_logger.addHandler(console_handler)
        
        # File Handler (JSON, rotating)
        log_file = self.LOG_DIR / "trade_intelligence.log"
        file_handler = logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024,  # 10 MB
            backupCount=5,
            encoding='utf-8'
        )
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(JSONFormatter())
        root_logger.addHandler(file_handler)
        
        # Error-only file handler
        error_file = self.LOG_DIR / "errors.log"
        error_handler = logging.handlers.RotatingFileHandler(
            error_file,
            maxBytes=5 * 1024 * 1024,  # 5 MB
            backupCount=3,
            encoding='utf-8'
        )
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(JSONFormatter())
        root_logger.addHandler(error_handler)
        
        self._root_logger = root_logger
    
    def get_logger(self, name: str) -> logging.Logger:
        """Get or create a named logger"""
        full_name = f"trade_intelligence.{name}"
        
        if full_name not in self._loggers:
            logger = logging.getLogger(full_name)
            level = self.MODULE_LEVELS.get(name, logging.INFO)
            logger.setLevel(level)
            self._loggers[full_name] = logger
        
        return self._loggers[full_name]
    
    def _log(self, level: int, msg: str, **kwargs):
        """Internal log method with extra data support"""
        logger = self._root_logger
        
        # Format message with kwargs
        if kwargs:
            extra_str = " | ".join(f"{k}={v}" for k, v in kwargs.items())
            msg = f"{msg} [{extra_str}]"
        
        logger.log(level, msg)
    
    def debug(self, msg: str, **kwargs):
        self._log(logging.DEBUG, msg, **kwargs)
    
    def info(self, msg: str, **kwargs):
        self._log(logging.INFO, msg, **kwargs)
    
    def warning(self, msg: str, **kwargs):
        self._log(logging.WARNING, msg, **kwargs)
    
    def error(self, msg: str, **kwargs):
        self._log(logging.ERROR, msg, **kwargs)
    
    def critical(self, msg: str, **kwargs):
        self._log(logging.CRITICAL, msg, **kwargs)
    
    def exception(self, msg: str, **kwargs):
        """Log exception with traceback"""
        self._root_logger.exception(msg)


# === Performance Timing Decorator ===

def log_performance(logger_name: str = "performance"):
    """
    Decorator to log function execution time
    
    Usage:
        @log_performance("market_fetch")
        def fetch_stock_data(symbol):
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            try:
                result = func(*args, **kwargs)
                elapsed = (time.perf_counter() - start) * 1000  # ms
                
                # Only log slow operations (>100ms)
                if elapsed > 100:
                    logger.info(
                        f"[PERF] {func.__name__} completed",
                        duration_ms=round(elapsed, 2)
                    )
                
                return result
            except Exception as e:
                elapsed = (time.perf_counter() - start) * 1000
                logger.error(
                    f"[PERF] {func.__name__} failed",
                    duration_ms=round(elapsed, 2),
                    error=str(e)
                )
                raise
        
        return wrapper
    return decorator


def log_api_call(func):
    """Decorator specifically for API endpoint logging"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        endpoint = func.__name__
        
        try:
            result = func(*args, **kwargs)
            elapsed = (time.perf_counter() - start) * 1000
            
            logger.info(
                f"API {endpoint}",
                status="success",
                duration_ms=round(elapsed, 2)
            )
            
            return result
        except Exception as e:
            elapsed = (time.perf_counter() - start) * 1000
            logger.error(
                f"API {endpoint}",
                status="error",
                duration_ms=round(elapsed, 2),
                error=str(e)
            )
            raise
    
    return wrapper


# Global logger instance
logger = TradeLogger()


# Module-specific loggers for convenience
def get_module_logger(name: str) -> logging.Logger:
    """Get a module-specific logger"""
    return logger.get_logger(name)
