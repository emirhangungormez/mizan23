"""
SQLite Database Layer with Connection Pooling

Features:
- Connection pooling for better performance
- Thread-safe operations
- Context manager support
- Automatic connection recycling
- Query execution helpers
"""

import sqlite3
import os
from datetime import datetime
from typing import List, Dict, Any, Optional, Generator
from contextlib import contextmanager
import json
import threading
import queue
import time
import atexit

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "storage", "trade_intelligence.db")


class ConnectionPool:
    """
    SQLite Connection Pool
    
    Manages a pool of database connections for efficient reuse.
    Thread-safe and supports automatic connection recycling.
    """
    
    def __init__(
        self, 
        db_path: str, 
        min_connections: int = 2,
        max_connections: int = 10,
        connection_timeout: float = 30.0,
        max_connection_age: float = 300.0  # 5 minutes
    ):
        self.db_path = db_path
        self.min_connections = min_connections
        self.max_connections = max_connections
        self.connection_timeout = connection_timeout
        self.max_connection_age = max_connection_age
        
        self._pool: queue.Queue = queue.Queue(maxsize=max_connections)
        self._connection_count = 0
        self._lock = threading.Lock()
        self._connection_times: Dict[int, float] = {}  # connection id -> creation time
        
        # Ensure database directory exists
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        
        # Pre-populate pool with minimum reusable connections
        for _ in range(min_connections):
            conn = self._create_connection()
            self._pool.put_nowait(conn)
        
        # Register cleanup on exit
        atexit.register(self.close_all)
    
    def _create_connection(self) -> sqlite3.Connection:
        """Create a new database connection"""
        conn = sqlite3.connect(
            self.db_path,
            timeout=self.connection_timeout,
            check_same_thread=False,  # Allow cross-thread usage
            isolation_level=None  # Autocommit mode
        )
        conn.row_factory = sqlite3.Row
        
        # Enable WAL mode for better concurrency
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA cache_size=10000")
        conn.execute("PRAGMA temp_store=MEMORY")
        
        conn_id = id(conn)
        self._connection_times[conn_id] = time.time()
        
        with self._lock:
            self._connection_count += 1
        
        return conn
    
    def _is_connection_stale(self, conn: sqlite3.Connection) -> bool:
        """Check if connection is too old"""
        conn_id = id(conn)
        creation_time = self._connection_times.get(conn_id, 0)
        return (time.time() - creation_time) > self.max_connection_age
    
    def get_connection(self) -> sqlite3.Connection:
        """Get a connection from the pool"""
        try:
            # Try to get existing connection
            conn = self._pool.get_nowait()
            
            # Check if connection is stale
            if self._is_connection_stale(conn):
                try:
                    conn.close()
                except:
                    pass
                with self._lock:
                    self._connection_count -= 1
                    conn_id = id(conn)
                    self._connection_times.pop(conn_id, None)
                return self._create_connection()
            
            # Verify connection is still valid
            try:
                conn.execute("SELECT 1")
                return conn
            except sqlite3.Error:
                with self._lock:
                    self._connection_count -= 1
                return self._create_connection()
                
        except queue.Empty:
            # No available connections, create new if under limit.
            # Decide under lock, but create outside it to avoid self-deadlock
            # because _create_connection also updates pool bookkeeping.
            should_create = False
            with self._lock:
                if self._connection_count < self.max_connections:
                    should_create = True

            if should_create:
                return self._create_connection()
            
            # Wait for available connection
            try:
                return self._pool.get(timeout=self.connection_timeout)
            except queue.Empty:
                raise RuntimeError("Connection pool exhausted")
    
    def return_connection(self, conn: sqlite3.Connection):
        """Return a connection to the pool"""
        if conn is None:
            return
        
        try:
            # Don't return stale connections
            if self._is_connection_stale(conn):
                conn.close()
                with self._lock:
                    self._connection_count -= 1
                    self._connection_times.pop(id(conn), None)
                return
            
            self._pool.put_nowait(conn)
        except queue.Full:
            # Pool is full, close connection
            conn.close()
            with self._lock:
                self._connection_count -= 1
                self._connection_times.pop(id(conn), None)
    
    def close_all(self):
        """Close all connections in the pool"""
        while True:
            try:
                conn = self._pool.get_nowait()
                try:
                    conn.close()
                except:
                    pass
            except queue.Empty:
                break
        
        with self._lock:
            self._connection_count = 0
            self._connection_times.clear()
    
    @contextmanager
    def connection(self) -> Generator[sqlite3.Connection, None, None]:
        """Context manager for database connection"""
        conn = self.get_connection()
        try:
            yield conn
        finally:
            self.return_connection(conn)
    
    @property
    def stats(self) -> Dict[str, Any]:
        """Get pool statistics"""
        return {
            "total_connections": self._connection_count,
            "available_connections": self._pool.qsize(),
            "max_connections": self.max_connections,
            "min_connections": self.min_connections,
        }


# Global connection pool instance
_pool: Optional[ConnectionPool] = None
_pool_lock = threading.Lock()


def get_connection_pool() -> ConnectionPool:
    """Get or create the global connection pool"""
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = ConnectionPool(DB_PATH)
    return _pool


def get_db_connection():
    """Get a database connection from the pool (legacy compatibility)"""
    return get_connection_pool().get_connection()


def return_db_connection(conn: sqlite3.Connection):
    """Return a connection to the pool"""
    get_connection_pool().return_connection(conn)


@contextmanager
def db_connection():
    """Context manager for database operations"""
    pool = get_connection_pool()
    with pool.connection() as conn:
        yield conn


def execute_query(query: str, params: tuple = ()) -> List[Dict[str, Any]]:
    """Execute a SELECT query and return results as list of dicts"""
    with db_connection() as conn:
        cursor = conn.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def execute_write(query: str, params: tuple = ()) -> int:
    """Execute an INSERT/UPDATE/DELETE query and return affected rows"""
    with db_connection() as conn:
        cursor = conn.execute(query, params)
        conn.commit()
        return cursor.rowcount


def execute_many(query: str, params_list: List[tuple]) -> int:
    """Execute a query with multiple parameter sets"""
    with db_connection() as conn:
        cursor = conn.executemany(query, params_list)
        conn.commit()
        return cursor.rowcount

def init_db():
    """Initialize the database with required tables, including extended financial data and valuation models."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Company Profile Table (EXISTING)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS company_profile (
        ticker TEXT PRIMARY KEY,
        company_name TEXT,
        description TEXT,
        sector TEXT,
        foundation_year INTEGER,
        headquarters TEXT,
        last_updated DATETIME
    )
    ''')

    # 2. Shareholders Table (EXISTING)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS company_shareholders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT,
        shareholder_name TEXT,
        share_count REAL,
        capital_ratio REAL,
        voting_ratio REAL,
        effective_date DATETIME,
        UNIQUE(ticker, shareholder_name)
    )
    ''')

    # 3. Subsidiaries Table (EXISTING)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS company_subsidiaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT,
        subsidiary_name TEXT,
        activity_field TEXT,
        capital REAL,
        paid_in_capital REAL,
        currency TEXT,
        ownership_ratio REAL,
        UNIQUE(ticker, subsidiary_name)
    )
    ''')

    # -------------------------------------------------------------
    # NEW RAW DATA TABLES (EXTENDED FINANCIALS)
    # -------------------------------------------------------------

    # 4. Extended Financials (Revenue Segmentation, Capex, etc.)
    # Stores year-by-year or quarter-by-quarter raw financial metrics that are not in basic tables
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS company_financials_extended (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT,
        period TEXT, -- '2023-12', '2024-03' etc.
        
        -- A. Revenue Quality & Segmentation (JSON fields for flexible list storage)
        revenue_segments TEXT, -- JSON: [{"segment": "Aviation", "amount": 100, "ratio": 80}, ...]
        export_revenue_ratio REAL,
        foreign_currency_revenue_ratio REAL,
        government_dependency_ratio REAL,
        top_customer_concentration REAL,

        -- B. Investment & Operational
        capex REAL,
        depreciation_amortization REAL,
        working_capital_change REAL,
        interest_expense REAL,
        interest_income REAL,
        deferred_tax_assets_liabilities REAL,

        -- C. Capital & Share Dynamics
        free_float_ratio REAL,
        public_float_ratio REAL,
        historical_capital_actions TEXT, -- JSON: [{"date": "2023-01", "type": "Bedelsiz", "ratio": 100}, ...]
        dividend_policy_text TEXT,
        share_buyback_history TEXT, -- JSON

        last_updated DATETIME,
        UNIQUE(ticker, period)
    )
    ''')
    
    # -------------------------------------------------------------
    # VALUATION & ASSUMPTIONS (INPUTS)
    # -------------------------------------------------------------

    # 5. Valuation Assumptions (User or System defines these for future projections)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS valuation_assumptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT,
        valuation_date DATETIME,
        version TEXT, -- 'v1', 'v2', 'user_custom_1'
        
        -- Scenarios: Low, Mid, High
        scenario_type TEXT, -- 'low', 'mid', 'high'
        
        -- Core Assumptions
        revenue_growth_assumption REAL,
        margin_assumption REAL,
        discount_rate_wacc REAL,
        terminal_growth_rate REAL,
        
        assumption_text_explanation TEXT,
        
        last_updated DATETIME
    )
    ''')

    # 6. Fair Value Calculation Inputs (Structured inputs for models)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS fair_value_inputs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT,
        valuation_date DATETIME,
        version TEXT,
        
        -- Using JSON to store detailed inputs for different models to allow flexibility
        dcf_inputs_json TEXT,       -- { "wacc": 15.5, "terminal_growth": 2.0, "fcf_projections": [...] }
        multiple_inputs_json TEXT,  -- { "peer_avg_pe": 10.5, "peer_avg_ev_ebitda": 6.2, ... }
        balance_inputs_json TEXT,   -- { "net_debt": 1000, "non_operating_assets": 500 ... }
        
        last_updated DATETIME
    )
    ''')

    # -------------------------------------------------------------
    # VALUATION OUTPUTS (RESULTS)
    # -------------------------------------------------------------

    # 7. Fair Value Results (The calculated "Intrinsic Value" bands)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS fair_value_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT,
        valuation_date DATETIME,
        version TEXT,
        
        -- The Band
        low_value_per_share REAL,
        mid_value_per_share REAL,
        high_value_per_share REAL,
        
        current_price_at_valuation REAL,
        upside_downside_potential_mid REAL, -- %
        
        -- Methodology Descriptions (Text)
        methodology_text TEXT,
        
        -- Scenario Explanations
        low_scenario_text TEXT,
        mid_scenario_text TEXT,
        high_scenario_text TEXT,
        
        limitations_notes_text TEXT,
        
        created_at DATETIME
    )
    ''')

    conn.commit()
    conn.close()

# ---------------------------------------------------------
# EXISTING SAVE FUNCTIONS (UNCHANGED)
# ---------------------------------------------------------

def save_company_profile(profile_data: Dict[str, Any]):
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
        INSERT OR REPLACE INTO company_profile 
        (ticker, company_name, description, sector, foundation_year, headquarters, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            profile_data['ticker'],
            profile_data.get('company_name'),
            profile_data.get('description'),
            profile_data.get('sector'),
            profile_data.get('foundation_year'),
            profile_data.get('headquarters'),
            datetime.now().isoformat()
        ))
        conn.commit()

def save_shareholders(ticker: str, shareholders: List[Dict[str, Any]]):
    with db_connection() as conn:
        cursor = conn.cursor()
        for sh in shareholders:
            cursor.execute('''
            INSERT OR REPLACE INTO company_shareholders 
            (ticker, shareholder_name, share_count, capital_ratio, voting_ratio, effective_date)
            VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                ticker,
                sh['shareholder_name'],
                sh.get('share_count'),
                sh.get('capital_ratio'),
                sh.get('voting_ratio'),
                sh.get('effective_date', datetime.now().isoformat())
            ))
        conn.commit()

def save_subsidiaries(ticker: str, subsidiaries: List[Dict[str, Any]]):
    with db_connection() as conn:
        cursor = conn.cursor()
        for sub in subsidiaries:
            cursor.execute('''
            INSERT OR REPLACE INTO company_subsidiaries 
            (ticker, subsidiary_name, activity_field, capital, paid_in_capital, currency, ownership_ratio)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                ticker,
                sub['subsidiary_name'],
                sub.get('activity_field'),
                sub.get('capital'),
                sub.get('paid_in_capital'),
                sub.get('currency', 'TRY'),
                sub.get('ownership_ratio')
            ))
        conn.commit()

# ---------------------------------------------------------
# NEW SAVE & GET FUNCTIONS FOR EXTENDED DATA
# ---------------------------------------------------------

def save_extended_financials(ticker: str, period: str, data: Dict[str, Any]):
    """Save raw extended financial metrics."""
    # helper to dump json if list/dict
    def to_json(val):
        return json.dumps(val, ensure_ascii=False) if isinstance(val, (list, dict)) else val

    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
        INSERT OR REPLACE INTO company_financials_extended
        (ticker, period, revenue_segments, export_revenue_ratio, foreign_currency_revenue_ratio, 
         government_dependency_ratio, top_customer_concentration, capex, depreciation_amortization, 
         working_capital_change, interest_expense, interest_income, deferred_tax_assets_liabilities,
         free_float_ratio, public_float_ratio, historical_capital_actions, dividend_policy_text, 
         share_buyback_history, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            ticker, period,
            to_json(data.get('revenue_segments')),
            data.get('export_revenue_ratio'),
            data.get('foreign_currency_revenue_ratio'),
            data.get('government_dependency_ratio'),
            data.get('top_customer_concentration'),
            data.get('capex'),
            data.get('depreciation_amortization'),
            data.get('working_capital_change'),
            data.get('interest_expense'),
            data.get('interest_income'),
            data.get('deferred_tax_assets_liabilities'),
            data.get('free_float_ratio'),
            data.get('public_float_ratio'),
            to_json(data.get('historical_capital_actions')),
            data.get('dividend_policy_text'),
            to_json(data.get('share_buyback_history')),
            datetime.now().isoformat()
        ))
        conn.commit()

def save_fair_value_result(ticker: str, result: Dict[str, Any]):
    """Save the final calculated fair value band and explanations."""
    current_time = datetime.now().isoformat()

    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
        INSERT INTO fair_value_results
        (ticker, valuation_date, version, low_value_per_share, mid_value_per_share, high_value_per_share,
         current_price_at_valuation, upside_downside_potential_mid, methodology_text, 
         low_scenario_text, mid_scenario_text, high_scenario_text, limitations_notes_text, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            ticker,
            result.get('valuation_date', current_time),
            result.get('version', 'v1'),
            result.get('low_value_per_share'),
            result.get('mid_value_per_share'),
            result.get('high_value_per_share'),
            result.get('current_price_at_valuation'),
            result.get('upside_downside_potential_mid'),
            result.get('methodology_text'),
            result.get('low_scenario_text'),
            result.get('mid_scenario_text'),
            result.get('high_scenario_text'),
            result.get('limitations_notes_text'),
            current_time
        ))
        conn.commit()

# ---------------------------------------------------------
# GETTERS
# ---------------------------------------------------------

def get_company_profile(ticker: str) -> Optional[Dict[str, Any]]:
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM company_profile WHERE ticker = ?', (ticker,))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_company_shareholders(ticker: str) -> List[Dict[str, Any]]:
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM company_shareholders WHERE ticker = ? ORDER BY capital_ratio DESC', (ticker,))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def get_company_subsidiaries(ticker: str) -> List[Dict[str, Any]]:
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM company_subsidiaries WHERE ticker = ?', (ticker,))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def get_extended_financials(ticker: str) -> List[Dict[str, Any]]:
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM company_financials_extended WHERE ticker = ? ORDER BY period DESC', (ticker,))
        rows = cursor.fetchall()
    
    results = []
    for row in rows:
        d = dict(row)
        # Parse JSON fields back to objects
        for field in ['revenue_segments', 'historical_capital_actions', 'share_buyback_history']:
            if d.get(field):
                try:
                    d[field] = json.loads(d[field])
                except:
                    d[field] = []
        results.append(d)
    return results

def get_latest_fair_value(ticker: str) -> Optional[Dict[str, Any]]:
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM fair_value_results WHERE ticker = ? ORDER BY created_at DESC LIMIT 1', (ticker,))
        row = cursor.fetchone()
        return dict(row) if row else None

if __name__ == "__main__":
    init_db()
    print("Database initialized with Extended Financials and Valuation tables.")
