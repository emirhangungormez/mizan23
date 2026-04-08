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
    logger.info("Trade Intelligence Engine starting up...")
    start_bist_refresh()
    logger.info("BIST background refresh started")
    try:
        start_benchmarks_refresh(15 * 60)
        logger.info("Benchmarks background refresh started (15m)")
    except Exception as e:
        logger.warning(f"Failed to start benchmarks refresh: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down Trade Intelligence Engine...")
    stop_bist_refresh()
    logger.info("BIST refresh stopped")
    try:
        stop_benchmarks_refresh()
        logger.info("Benchmarks refresh stopped")
    except Exception as e:
        logger.warning(f"Failed to stop benchmarks refresh: {e}")
    try:
        pool = get_connection_pool()
        pool.close_all()
        logger.info("Connection pool closed")
    except:
        pass


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
    return {"status": "running", "service": "Trade Intelligence Engine", "version": "2.1.0"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
