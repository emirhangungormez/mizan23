"""Trade Intelligence Engine - FastAPI Entry Point

This is the main entry point for the Python backend engine.
All market data fetching, mathematical calculations, and analysis happen here.
The frontend communicates with this engine via HTTP on localhost.

Updated for borsapy 0.7.2 with new features:
- TCMB interest rates
- Eurobonds
- Enhanced screener with templates
- Technical scanning with scan()
- Fund risk metrics and comparisons
- TradingView streaming support

Professional optimizations (v2.1):
- In-memory caching with TTL and LRU eviction
- Async batch operations for parallel fetching
- Retry mechanism with exponential backoff
- Structured logging system
- Data validation with Pydantic
- SQLite connection pooling
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from api.market import router as market_router
from api.portfolio import router as portfolio_router
from api.analysis import router as analysis_router, start_benchmarks_refresh, stop_benchmarks_refresh
from api.borsapy_v072_api import router as borsapy_v072_router
from api.bist_data import router as bist_data_router, start_bist_refresh, stop_bist_refresh
from api.user import router as user_router
from api.dashboard import router as dashboard_router
from api.assets import router as assets_router
from engine.data.market_fetch import market_fetcher
from engine.utils import MaintenanceManager, logger
from engine.cache import cache_manager
from engine.storage.db import init_db, get_connection_pool

app = FastAPI(
    title="Trade Intelligence Engine",
    description="Local-only financial intelligence and portfolio analysis system (borsapy 0.7.2)",
    version="2.1.0"
)


@app.on_event("startup")
async def startup_event():
    """Initialize system components on startup"""
    logger.info("Trade Intelligence Engine starting up...")
    
    # Start BIST background refresh
    start_bist_refresh()
    logger.info("BIST background refresh started")

    # Start benchmarks refresh (15 minutes)
    try:
        start_benchmarks_refresh(15 * 60)
        logger.info("Benchmarks background refresh started (15m)")
    except Exception as e:
        logger.warning(f"Failed to start benchmarks refresh: {e}")

    try:
        market_fetcher.start_analysis_snapshot_refresh()
        logger.info("Analysis snapshot refresh started")
    except Exception as e:
        logger.warning(f"Failed to start analysis snapshot refresh: {e}")
    
    logger.info("System startup complete")
"""Trade Intelligence Engine - FastAPI Entry Point

This is the main entry point for the Python backend engine.
All market data fetching, mathematical calculations, and analysis happen here.
The frontend communicates with this engine via HTTP on localhost.

Updated for borsapy 0.7.2 with new features:
- TCMB interest rates
- Eurobonds
- Enhanced screener with templates
- Technical scanning with scan()
- Fund risk metrics and comparisons
- TradingView streaming support

Professional optimizations (v2.1):
- In-memory caching with TTL and LRU eviction
- Async batch operations for parallel fetching
- Retry mechanism with exponential backoff
- Structured logging system
- Data validation with Pydantic
- SQLite connection pooling
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from api.market import router as market_router
from api.portfolio import router as portfolio_router
from api.analysis import router as analysis_router, start_benchmarks_refresh, stop_benchmarks_refresh
from api.borsapy_v072_api import router as borsapy_v072_router
from api.bist_data import router as bist_data_router, start_bist_refresh, stop_bist_refresh
from api.user import router as user_router
from api.dashboard import router as dashboard_router
from api.assets import router as assets_router
from engine.utils import MaintenanceManager, logger
from engine.cache import cache_manager
from engine.storage.db import init_db, get_connection_pool

app = FastAPI(
    title="Trade Intelligence Engine",
    description="Local-only financial intelligence and portfolio analysis system (borsapy 0.7.2)",
    version="2.1.0"
)


@app.on_event("startup")
async def startup_event():
    """Initialize system components on startup"""
    logger.info("Trade Intelligence Engine starting up...")
    
    # Start BIST background refresh
    start_bist_refresh()
    logger.info("BIST background refresh started")

    # Start benchmarks refresh (15 minutes)
    try:
        start_benchmarks_refresh(15 * 60)
        logger.info("Benchmarks background refresh started (15m)")
    except Exception as e:
        logger.warning(f"Failed to start benchmarks refresh: {e}")
    
    logger.info("System startup complete")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down Trade Intelligence Engine...")
    
    # Stop BIST refresh
    stop_bist_refresh()
    logger.info("BIST refresh stopped")
    # Stop benchmarks refresh
    try:
        stop_benchmarks_refresh()
        logger.info("Benchmarks refresh stopped")
    except Exception as e:
        logger.warning(f"Failed to stop benchmarks refresh: {e}")
    
    # Close connection pool
    try:
        pool = get_connection_pool()
        pool.close_all()
        logger.info("Connection pool closed")
    except:
        pass
    
    logger.info("Shutdown complete")


# Enable CORS for React frontend (localhost only in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(market_router, prefix="/api/market", tags=["Market Data"])
app.include_router(portfolio_router, prefix="/api/portfolio", tags=["Portfolio"])
app.include_router(analysis_router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(borsapy_v072_router, prefix="/api/v2", tags=["Borsapy 0.7.2 Features"])
app.include_router(bist_data_router, prefix="/api/market", tags=["BIST Real-time Data"])
app.include_router(user_router, prefix="/api/user", tags=["User Data"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["Dashboard Data"])
app.include_router(assets_router, prefix="/api/assets", tags=["Asset Search"])
app.include_router(assets_router, prefix="/api/assets", tags=["Asset Search"])
app.include_router(assets_router, prefix="/api/assets", tags=["Asset Search"])
app.include_router(assets_router, prefix="/api/assets", tags=["Asset Search"])


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "Trade Intelligence Engine",
        "version": "2.1.0",
        "disclaimer": "This system provides probabilistic analysis only. Not financial advice."
    }


@app.get("/api/health")
async def health_check():
    """Detailed health check with cache and pool stats"""
    try:
        pool_stats = get_connection_pool().stats
    except:
        pool_stats = {}
    
    return {
        "status": "healthy",
        "version": "2.1.0",
        "components": {
            "market_data": "operational",
            "analysis_engine": "operational",
            "portfolio_system": "operational",
            "cache_system": "operational",
            "connection_pool": "operational"
        },
        "cache_stats": cache_manager.get_stats(),
        "pool_stats": pool_stats
    }


@app.get("/api/system/cache")
async def get_cache_stats():
    """Get detailed cache statistics"""
    return {
        "namespaces": cache_manager.get_stats(),
        "ttl_config": cache_manager.TTL_CONFIG,
        "size_config": cache_manager.SIZE_CONFIG
    }


@app.post("/api/system/cache/clear")
async def clear_cache(namespace: str = None):
    """Clear cache (optionally specific namespace)"""
    if namespace:
        cache_manager.clear_namespace(namespace)
        logger.info(f"Cache namespace '{namespace}' cleared")
        return {"message": f"Cache namespace '{namespace}' cleared"}
    else:
        cache_manager.clear_all()
        logger.info("All caches cleared")
        return {"message": "All caches cleared"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down Trade Intelligence Engine...")
    
    # Stop BIST refresh
    stop_bist_refresh()
    logger.info("BIST refresh stopped")
    # Stop benchmarks refresh
    try:
        stop_benchmarks_refresh()
        logger.info("Benchmarks refresh stopped")
    except Exception as e:
        logger.warning(f"Failed to stop benchmarks refresh: {e}")
    
    # Close connection pool
    try:
        pool = get_connection_pool()
        pool.close_all()
        logger.info("Connection pool closed")
    except:
        pass
    
    logger.info("Shutdown complete")


# Enable CORS for React frontend (localhost only in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(market_router, prefix="/api/market", tags=["Market Data"])
app.include_router(portfolio_router, prefix="/api/portfolio", tags=["Portfolio"])
app.include_router(analysis_router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(borsapy_v072_router, prefix="/api/v2", tags=["Borsapy 0.7.2 Features"])
app.include_router(bist_data_router, prefix="/api/market", tags=["BIST Real-time Data"])
app.include_router(user_router, prefix="/api/user", tags=["User Data"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["Dashboard Data"])
app.include_router(assets_router, prefix="/api/assets", tags=["Asset Search"])


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "Trade Intelligence Engine",
        "version": "2.1.0",
        "disclaimer": "This system provides probabilistic analysis only. Not financial advice."
    }


@app.get("/api/health")
async def health_check():
    """Detailed health check with cache and pool stats"""
    try:
        pool_stats = get_connection_pool().stats
    except:
        pool_stats = {}
    
    return {
        "status": "healthy",
        "version": "2.1.0",
        "components": {
            "market_data": "operational",
            "analysis_engine": "operational",
            "portfolio_system": "operational",
            "cache_system": "operational",
            "connection_pool": "operational"
        },
        "cache_stats": cache_manager.get_stats(),
        "pool_stats": pool_stats
    }


@app.get("/api/system/cache")
async def get_cache_stats():
    """Get detailed cache statistics"""
    return {
        "namespaces": cache_manager.get_stats(),
        "ttl_config": cache_manager.TTL_CONFIG,
        "size_config": cache_manager.SIZE_CONFIG
    }


@app.post("/api/system/cache/clear")
async def clear_cache(namespace: str = None):
    """Clear cache (optionally specific namespace)"""
    if namespace:
        cache_manager.clear_namespace(namespace)
        logger.info(f"Cache namespace '{namespace}' cleared")
        return {"message": f"Cache namespace '{namespace}' cleared"}
    else:
        cache_manager.clear_all()
        logger.info("All caches cleared")
        return {"message": "All caches cleared"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from api.market import router as market_router
from api.portfolio import router as portfolio_router
from api.analysis import router as analysis_router, start_benchmarks_refresh, stop_benchmarks_refresh
from api.borsapy_v072_api import router as borsapy_v072_router
from api.bist_data import router as bist_data_router, start_bist_refresh, stop_bist_refresh
from api.user import router as user_router
from api.dashboard import router as dashboard_router
from engine.utils import MaintenanceManager, logger
from engine.cache import cache_manager
from engine.storage.db import init_db, get_connection_pool

app = FastAPI(
    title="Trade Intelligence Engine",
    description="Local-only financial intelligence and portfolio analysis system (borsapy 0.7.2)",
    version="2.1.0"
)

@app.on_event("startup")
async def startup_event():
    """Initialize system components on startup"""
    logger.info("Trade Intelligence Engine starting up...")
    
    # Start BIST background refresh
    start_bist_refresh()
    logger.info("BIST background refresh started")

    # Start benchmarks refresh (15 minutes)
    try:
        start_benchmarks_refresh(15 * 60)
        logger.info("Benchmarks background refresh started (15m)")
    except Exception as e:
        logger.warning(f"Failed to start benchmarks refresh: {e}")
    
    logger.info("System startup complete")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down Trade Intelligence Engine...")
    
    # Stop BIST refresh
    stop_bist_refresh()
    logger.info("BIST refresh stopped")
    # Stop benchmarks refresh
    try:
        stop_benchmarks_refresh()
        logger.info("Benchmarks refresh stopped")
    except Exception as e:
        logger.warning(f"Failed to stop benchmarks refresh: {e}")
    
    # Close connection pool
    try:
        pool = get_connection_pool()
        pool.close_all()
        logger.info("Connection pool closed")
    except:
        pass
    
    logger.info("Shutdown complete")

# Enable CORS for React frontend (localhost only in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(market_router, prefix="/api/market", tags=["Market Data"])
app.include_router(portfolio_router, prefix="/api/portfolio", tags=["Portfolio"])
app.include_router(analysis_router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(borsapy_v072_router, prefix="/api/v2", tags=["Borsapy 0.7.2 Features"])
app.include_router(bist_data_router, prefix="/api/market", tags=["BIST Real-time Data"])
app.include_router(user_router, prefix="/api/user", tags=["User Data"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["Dashboard Data"])
app.include_router(assets_router, prefix="/api/assets", tags=["Asset Search"])


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "Trade Intelligence Engine",
        "version": "2.1.0",
        "disclaimer": "This system provides probabilistic analysis only. Not financial advice."
    }


@app.get("/api/health")
async def health_check():
    """Detailed health check with cache and pool stats"""
    try:
        pool_stats = get_connection_pool().stats
    except:
        pool_stats = {}
    
    return {
        "status": "healthy",
        "version": "2.1.0",
        "components": {
            "market_data": "operational",
            "analysis_engine": "operational",
            "portfolio_system": "operational",
            "cache_system": "operational",
            "connection_pool": "operational"
        },
        "cache_stats": cache_manager.get_stats(),
        "pool_stats": pool_stats
    }


@app.get("/api/system/cache")
async def get_cache_stats():
    """Get detailed cache statistics"""
    return {
        "namespaces": cache_manager.get_stats(),
        "ttl_config": cache_manager.TTL_CONFIG,
        "size_config": cache_manager.SIZE_CONFIG
    }


@app.post("/api/system/cache/clear")
async def clear_cache(namespace: str = None):
    """Clear cache (optionally specific namespace)"""
    if namespace:
        cache_manager.clear_namespace(namespace)
        logger.info(f"Cache namespace '{namespace}' cleared")
        return {"message": f"Cache namespace '{namespace}' cleared"}
    else:
        cache_manager.clear_all()
        logger.info("All caches cleared")
        return {"message": "All caches cleared"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

