from fastapi import APIRouter, HTTPException
from typing import ClassVar
from pathlib import Path
import json

router: ClassVar[APIRouter] = APIRouter()
USER_DIR = Path(__file__).parent.parent.parent / "storage" / "users"

@router.get("/api/user/{user_id}/settings")
def get_user_settings(user_id: str):
    settings_path = USER_DIR / f"{user_id}_settings.json"
    if not settings_path.exists():
        raise HTTPException(status_code=404, detail="Settings not found")
    with open(settings_path, "r", encoding="utf-8") as f:
        return json.load(f)

@router.get("/api/user/{user_id}/portfolio")
def get_user_portfolio(user_id: str):
    portfolio_path = USER_DIR / f"{user_id}_portfolio.json"
    if not portfolio_path.exists():
        raise HTTPException(status_code=404, detail="Portfolio not found")
    with open(portfolio_path, "r", encoding="utf-8") as f:
        return json.load(f)

@router.post("/api/user/{user_id}/settings")
def update_user_settings(user_id: str, settings: dict):
    settings_path = USER_DIR / f"{user_id}_settings.json"
    with open(settings_path, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)
    return {"status": "ok"}

@router.post("/api/user/{user_id}/portfolio")
def update_user_portfolio(user_id: str, portfolio: dict):
    portfolio_path = USER_DIR / f"{user_id}_portfolio.json"
    with open(portfolio_path, "w", encoding="utf-8") as f:
        json.dump(portfolio, f, indent=2, ensure_ascii=False)
    return {"status": "ok"}
