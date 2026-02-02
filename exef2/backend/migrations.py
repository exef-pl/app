"""
EXEF Database Migrations

Usage:
    python migrations.py upgrade      # Apply all pending migrations
    python migrations.py downgrade    # Rollback last migration
    python migrations.py status       # Show migration status
"""
import sqlite3
import os
import sys
from datetime import datetime

DB_PATH = os.getenv("EXEF_DB_PATH", os.path.join(os.path.dirname(__file__), "..", "data", "exef.db"))

# Migration definitions: (version, name, up_sql, down_sql)
MIGRATIONS = [
    (1, "initial_schema", """
        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            data JSON
        );
        CREATE TABLE IF NOT EXISTS endpoints (
            id TEXT PRIMARY KEY,
            profile_id TEXT,
            data JSON
        );
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            profile_id TEXT,
            data JSON
        );
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT,
            type TEXT,
            data JSON
        );
        CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            name TEXT,
            applied_at TEXT
        );
    """, """
        DROP TABLE IF EXISTS events;
        DROP TABLE IF EXISTS documents;
        DROP TABLE IF EXISTS endpoints;
        DROP TABLE IF EXISTS profiles;
        DROP TABLE IF EXISTS _migrations;
    """),
    
    (2, "add_indexes", """
        CREATE INDEX IF NOT EXISTS idx_endpoints_profile ON endpoints(profile_id);
        CREATE INDEX IF NOT EXISTS idx_documents_profile ON documents(profile_id);
        CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(json_extract(data, '$.status'));
        CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
    """, """
        DROP INDEX IF EXISTS idx_endpoints_profile;
        DROP INDEX IF EXISTS idx_documents_profile;
        DROP INDEX IF EXISTS idx_documents_status;
        DROP INDEX IF EXISTS idx_events_ts;
    """),
    
    (3, "add_users_table", """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            password_hash TEXT,
            data JSON,
            created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS profile_users (
            profile_id TEXT,
            user_id TEXT,
            role TEXT DEFAULT 'viewer',
            created_at TEXT,
            PRIMARY KEY (profile_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    """, """
        DROP TABLE IF EXISTS profile_users;
        DROP TABLE IF EXISTS users;
    """),
    
    (4, "add_attachments_table", """
        CREATE TABLE IF NOT EXISTS attachments (
            id TEXT PRIMARY KEY,
            document_id TEXT,
            filename TEXT,
            mime_type TEXT,
            size INTEGER,
            storage_path TEXT,
            created_at TEXT,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_attachments_document ON attachments(document_id);
    """, """
        DROP TABLE IF EXISTS attachments;
    """),
    
    (5, "add_sync_queue", """
        CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint_id TEXT,
            action TEXT,
            payload JSON,
            status TEXT DEFAULT 'pending',
            attempts INTEGER DEFAULT 0,
            last_error TEXT,
            created_at TEXT,
            processed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
    """, """
        DROP TABLE IF EXISTS sync_queue;
    """),
    
    (6, "add_profile_delegates", """
        CREATE TABLE IF NOT EXISTS profile_delegates (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL,
            delegate_name TEXT NOT NULL,
            delegate_email TEXT,
            delegate_nip TEXT,
            role TEXT DEFAULT 'viewer',
            permissions JSON DEFAULT '{}',
            active INTEGER DEFAULT 1,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_delegates_profile ON profile_delegates(profile_id);
        CREATE INDEX IF NOT EXISTS idx_delegates_email ON profile_delegates(delegate_email);
        CREATE INDEX IF NOT EXISTS idx_delegates_nip ON profile_delegates(delegate_nip);
    """, """
        DROP INDEX IF EXISTS idx_delegates_nip;
        DROP INDEX IF EXISTS idx_delegates_email;
        DROP INDEX IF EXISTS idx_delegates_profile;
        DROP TABLE IF EXISTS profile_delegates;
    """),
]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_current_version(conn) -> int:
    """Get current migration version"""
    try:
        result = conn.execute("SELECT MAX(version) FROM _migrations").fetchone()
        return result[0] or 0
    except:
        return 0


def upgrade():
    """Apply all pending migrations"""
    conn = get_db()
    current = get_current_version(conn)
    
    applied = 0
    for version, name, up_sql, _ in MIGRATIONS:
        if version > current:
            print(f"Applying migration {version}: {name}...")
            try:
                conn.executescript(up_sql)
                conn.execute(
                    "INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)",
                    (version, name, datetime.utcnow().isoformat())
                )
                conn.commit()
                print(f"  ✓ Applied")
                applied += 1
            except Exception as e:
                print(f"  ✗ Error: {e}")
                conn.rollback()
                return False
    
    if applied == 0:
        print("No pending migrations.")
    else:
        print(f"\nApplied {applied} migration(s).")
    
    conn.close()
    return True


def downgrade():
    """Rollback last migration"""
    conn = get_db()
    current = get_current_version(conn)
    
    if current == 0:
        print("No migrations to rollback.")
        return True
    
    for version, name, _, down_sql in reversed(MIGRATIONS):
        if version == current:
            print(f"Rolling back migration {version}: {name}...")
            try:
                conn.executescript(down_sql)
                conn.execute("DELETE FROM _migrations WHERE version = ?", (version,))
                conn.commit()
                print(f"  ✓ Rolled back")
            except Exception as e:
                print(f"  ✗ Error: {e}")
                conn.rollback()
                return False
            break
    
    conn.close()
    return True


def status():
    """Show migration status"""
    conn = get_db()
    current = get_current_version(conn)
    
    print(f"Database: {DB_PATH}")
    print(f"Current version: {current}")
    print("\nMigrations:")
    print("-" * 50)
    
    for version, name, _, _ in MIGRATIONS:
        status = "✓ Applied" if version <= current else "○ Pending"
        print(f"  {version:3d}  {name:30s}  {status}")
    
    conn.close()


def create_migration(name: str):
    """Generate new migration template"""
    next_version = len(MIGRATIONS) + 1
    template = f'''
    ({next_version}, "{name}", """
        -- UP migration
        -- Add your SQL here
    """, """
        -- DOWN migration
        -- Add rollback SQL here
    """),
'''
    print(f"Add this to MIGRATIONS list in migrations.py:\n{template}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python migrations.py [upgrade|downgrade|status|create NAME]")
        sys.exit(1)
    
    cmd = sys.argv[1]
    
    if cmd == "upgrade":
        success = upgrade()
        sys.exit(0 if success else 1)
    elif cmd == "downgrade":
        success = downgrade()
        sys.exit(0 if success else 1)
    elif cmd == "status":
        status()
    elif cmd == "create" and len(sys.argv) > 2:
        create_migration(sys.argv[2])
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
