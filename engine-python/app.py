from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from api.analysis import (
    router as analysis_router,
    start_benchmarks_refresh,
    stop_benchmarks_refresh,
)
from api.assets import router as assets_router
from api.bist_data import (
    router as bist_data_router,
    start_bist_refresh,
    stop_bist_refresh,
)
from api.borsapy_v072_api import router as borsapy_v072_router
from api.dashboard import router as dashboard_router
from api.market import router as market_router
from api.portfolio import router as portfolio_router
from api.user import router as user_router
from engine.cache import cache_manager
from engine.data.market_fetch import market_fetcher
from engine.storage.db import get_connection_pool, init_db
from engine.utils import logger

APP_NAME = "mizan23 Engine"
APP_VERSION = "2.1.0"

app = FastAPI(
    title=APP_NAME,
    description="Yerel calisan piyasa zekasi ve portfoy karar destek motoru",
    version=APP_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market_router, prefix="/api/market", tags=["Piyasa"])
app.include_router(portfolio_router, prefix="/api/portfolio", tags=["Portfoy"])
app.include_router(analysis_router, prefix="/api/analysis", tags=["Analiz"])
app.include_router(borsapy_v072_router, prefix="/api/v2", tags=["Borsapy"])
app.include_router(bist_data_router, prefix="/api/market", tags=["BIST"])
app.include_router(user_router, prefix="/api/user", tags=["Kullanici"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["Panel"])
app.include_router(assets_router, prefix="/api/assets", tags=["Varlik Arama"])


@app.on_event("startup")
async def startup_event():
    logger.info("%s baslatiliyor...", APP_NAME)
    init_db()
    start_bist_refresh()
    logger.info("BIST arka plan yenilemesi basladi")

    try:
        start_benchmarks_refresh(15 * 60)
        logger.info("Benchmark yenilemesi basladi (15 dk)")
    except Exception as exc:
        logger.warning("Benchmark yenilemesi baslatilamadi: %s", exc)

    try:
        market_fetcher.start_analysis_snapshot_refresh()
        logger.info("Analiz snapshot yenilemesi basladi")
    except Exception as exc:
        logger.warning("Analiz snapshot yenilemesi baslatilamadi: %s", exc)


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("%s kapatiliyor...", APP_NAME)
    stop_bist_refresh()

    try:
        stop_benchmarks_refresh()
    except Exception as exc:
        logger.warning("Benchmark yenilemesi durdurulamadi: %s", exc)

    try:
        pool = get_connection_pool()
        pool.close_all()
    except Exception as exc:
        logger.warning("Baglanti havuzu kapatilamadi: %s", exc)


@app.get("/")
async def root():
    return {
        "status": "running",
        "service": APP_NAME,
        "version": APP_VERSION,
        "disclaimer": "Bu sistem yalnizca karar destek amacli kullanilir.",
    }


@app.get("/api/health")
async def health_check():
    try:
        pool_stats = get_connection_pool().stats
    except Exception:
        pool_stats = {}

    return {
        "status": "healthy",
        "service": APP_NAME,
        "version": APP_VERSION,
        "components": {
            "market_data": "operational",
            "analysis_engine": "operational",
            "portfolio_system": "operational",
            "cache_system": "operational",
            "connection_pool": "operational",
        },
        "cache_stats": cache_manager.get_stats(),
        "pool_stats": pool_stats,
    }


@app.get("/api/system/cache")
async def get_cache_stats():
    return {
        "namespaces": cache_manager.get_stats(),
        "ttl_config": cache_manager.TTL_CONFIG,
        "size_config": cache_manager.SIZE_CONFIG,
    }


@app.post("/api/system/cache/clear")
async def clear_cache(namespace: str | None = None):
    if namespace:
        cache_manager.clear_namespace(namespace)
        logger.info("Cache namespace temizlendi: %s", namespace)
        return {"message": f"Cache namespace temizlendi: {namespace}"}

    cache_manager.clear_all()
    logger.info("Tum cache alanlari temizlendi")
    return {"message": "Tum cache alanlari temizlendi"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3003)
