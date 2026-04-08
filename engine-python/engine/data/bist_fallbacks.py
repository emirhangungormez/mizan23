from __future__ import annotations

from typing import Any, Dict, Optional

from storage.proprietary_snapshots import load_latest_bist_proprietary_snapshot


def load_bist_reference_stock(symbol: str) -> Optional[Dict[str, Any]]:
    normalized = (symbol or "").upper().replace(".IS", "").replace(".E", "")
    if not normalized:
        return None

    try:
        from api.bist_data import data_store  # Lazy import to avoid startup cycles

        live_stock = data_store.get_stock(normalized)
        if live_stock:
            payload = dict(live_stock)
            payload["_reference_source"] = "bist_live_store"
            return payload
    except Exception:
        pass

    try:
        snapshot = load_latest_bist_proprietary_snapshot() or {}
        for item in snapshot.get("stocks", []) or []:
            if str(item.get("symbol") or "").upper() == normalized:
                payload = dict(item)
                payload["_reference_source"] = "bist_snapshot"
                return payload
    except Exception:
        pass

    return None
