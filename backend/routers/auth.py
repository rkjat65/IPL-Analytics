"""Authentication router — register, login, logout, Google OAuth, password reset."""

import hashlib
import json
import os
import secrets
import smtplib
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from ..auth_db import get_auth_db
from ..database import get_db, query

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:
    pass

router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "rkdevanda65@gmail.com").lower()
SESSION_EXPIRY_DAYS = 7
RESET_TOKEN_EXPIRY_HOURS = 1
SMTP_HOST = os.environ.get("SMTP_HOST") or ""
SMTP_PORT = int(os.environ.get("SMTP_PORT") or "587")
SMTP_USERNAME = os.environ.get("SMTP_USERNAME", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM") or "Crickrida <no-reply@crickrida.rkjat.in>"
PUBLIC_APP_URL = (os.environ.get("PUBLIC_APP_URL") or "https://crickrida.rkjat.in").rstrip("/")
EXPOSE_RESET_TOKEN = os.environ.get("EXPOSE_RESET_TOKEN", "").lower() in {
    "1", "true", "yes"
}


# ── Pydantic models ─────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleLoginRequest(BaseModel):
    credential: str


class SetPasswordRequest(BaseModel):
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AdminResetPasswordRequest(BaseModel):
    user_id: str
    new_password: str


class AdminSqlQueryRequest(BaseModel):
    sql: str


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    avatar_url: Optional[str] = None
    plan: Optional[str] = "free"
    is_admin: bool = False


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


# ── Password helpers ─────────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hash_val = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), 100000
    )
    return f"{salt}:{hash_val.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt, hash_val = stored.split(":")
    new_hash = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), 100000
    )
    return new_hash.hex() == hash_val


# ── Admin check ─────────────────────────────────────────────────────

ADMIN_ONLY_DETAIL = "Sign-in is only available to site administrators."


def _is_admin_email(email: str) -> bool:
    return (email or "").strip().lower() == ADMIN_EMAIL


def require_admin(authorization: Optional[str] = Header(None)) -> dict:
    """FastAPI dependency: the request must carry a verified admin session."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access only")
    return user


def _is_admin(user: dict) -> bool:
    """Check if the user is the platform admin.

    The email must match ADMIN_EMAIL *and* be verified (Google sign-in or a
    completed email password reset). Otherwise anyone could register the
    admin address with a password before the real admin does.
    """
    return bool(user.get("is_verified")) and (
        user.get("email", "").lower() == ADMIN_EMAIL
    )


# ── Session helpers ──────────────────────────────────────────────────

def _create_session(user_id: str) -> str:
    """Create a session token, clean expired sessions, return the token."""
    db = get_auth_db()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    db.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
    token = secrets.token_urlsafe(32)
    expires = (
        datetime.now(timezone.utc) + timedelta(days=SESSION_EXPIRY_DAYS)
    ).strftime("%Y-%m-%d %H:%M:%S")
    db.execute(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
        (token, user_id, expires),
    )
    db.commit()
    return token


def _user_dict(row) -> dict:
    d = {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "avatar_url": row["avatar_url"],
    }
    try:
        d["plan"] = row["plan"] or "free"
    except (IndexError, KeyError):
        d["plan"] = "free"
    try:
        d["is_verified"] = bool(row["is_verified"])
    except (IndexError, KeyError):
        d["is_verified"] = False
    d["is_admin"] = _is_admin(d)
    return d


def _validate_email(email: str):
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Invalid email address")


def _validate_password(password: str):
    if len(password) < 6:
        raise HTTPException(
            status_code=400, detail="Password must be at least 6 characters"
        )


# ── Dependency: get current user (optional) ──────────────────────────

def get_current_user(
    authorization: Optional[str] = Header(None),
) -> Optional[dict]:
    """Extract and validate session token from Authorization header."""
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1]
    db = get_auth_db()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    row = db.execute(
        """
        SELECT u.id, u.name, u.email, u.avatar_url, u.plan, u.is_verified
        FROM sessions s JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > ?
        """,
        (token, now),
    ).fetchone()
    if not row:
        return None
    return _user_dict(row)


# ── Endpoints ────────────────────────────────────────────────────────

@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest):
    if not _is_admin_email(body.email):
        raise HTTPException(status_code=403, detail=ADMIN_ONLY_DETAIL)
    db = get_auth_db()
    row = db.execute(
        "SELECT * FROM users WHERE email = ?", (body.email.lower(),)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # If this is a Google-only account with no password set
    if not row["password_hash"]:
        raise HTTPException(
            status_code=401,
            detail="This account uses Google sign-in. Please use 'Sign in with Google' or set a password first.",
        )

    if not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Track login
    db.execute(
        "UPDATE users SET last_login = datetime('now'), login_count = COALESCE(login_count, 0) + 1 WHERE id = ?",
        (row["id"],),
    )
    db.commit()

    token = _create_session(row["id"])
    return {"token": token, "user": _user_dict(row)}


@router.post("/logout")
def logout(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = parts[1]
    db = get_auth_db()
    db.execute("DELETE FROM sessions WHERE token = ?", (token,))
    db.commit()
    return {"detail": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
def me(authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


# ── Set password (for Google users who want email login too) ─────────

@router.post("/set-password")
def set_password(body: SetPasswordRequest, authorization: Optional[str] = Header(None)):
    """Allow a logged-in Google user to set a password for email login."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _validate_password(body.password)

    db = get_auth_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    if row["password_hash"]:
        raise HTTPException(
            status_code=400,
            detail="Password already set. Use 'Change Password' instead.",
        )

    pw_hash = hash_password(body.password)
    db.execute(
        "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
        (pw_hash, user["id"]),
    )
    db.commit()
    return {"detail": "Password set successfully. You can now sign in with email and password."}


# ── Change password (for logged-in users) ────────────────────────────

@router.post("/change-password")
def change_password(body: ChangePasswordRequest, authorization: Optional[str] = Header(None)):
    """Change password for a logged-in user."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _validate_password(body.new_password)

    db = get_auth_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()

    # If user has an existing password, verify it
    if row["password_hash"]:
        if not verify_password(body.current_password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Current password is incorrect")

    pw_hash = hash_password(body.new_password)
    db.execute(
        "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
        (pw_hash, user["id"]),
    )
    db.commit()
    return {"detail": "Password changed successfully"}


# ── Account deletion ────────────────────────────────────────────────

@router.delete("/account")
def delete_account(authorization: Optional[str] = Header(None)):
    """Permanently delete the signed-in user and their account-linked data."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_auth_db()
    with db:
        db.execute("DELETE FROM usage WHERE user_id = ?", (user["id"],))
        db.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
        deleted = db.execute("DELETE FROM users WHERE id = ?", (user["id"],))

    if deleted.rowcount != 1:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"detail": "Account and associated data deleted permanently"}


# ── Forgot password (generates reset token) ──────────────────────────

def _send_reset_email(recipient: str, reset_token: str) -> bool:
    """Send a one-hour reset link when SMTP is configured."""
    if not SMTP_HOST:
        return False

    reset_url = f"{PUBLIC_APP_URL}/login?reset_token={reset_token}"
    message = EmailMessage()
    message["Subject"] = "Reset your Crickrida password"
    message["From"] = SMTP_FROM
    message["To"] = recipient
    message.set_content(
        "A password reset was requested for your Crickrida account.\n\n"
        f"Open this link within {RESET_TOKEN_EXPIRY_HOURS} hour: {reset_url}\n\n"
        "If you did not request this, you can safely ignore this email."
    )

    if SMTP_PORT == 465:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15) as smtp:
            if SMTP_USERNAME:
                smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
            smtp.send_message(message)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as smtp:
            smtp.starttls()
            if SMTP_USERNAME:
                smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
            smtp.send_message(message)
    return True

@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest):
    """Email a password reset link without exposing account existence."""
    db = get_auth_db()
    row = db.execute(
        "SELECT id, auth_provider FROM users WHERE email = ?",
        (body.email.lower(),),
    ).fetchone()

    # Always return success to prevent email enumeration. Only the admin
    # account can sign in, so only it can receive a reset link.
    if not row or not _is_admin_email(body.email):
        return {"detail": "If an account with that email exists, a reset link has been generated."}

    # Create reset token
    reset_token = secrets.token_urlsafe(32)
    expires = (
        datetime.now(timezone.utc) + timedelta(hours=RESET_TOKEN_EXPIRY_HOURS)
    ).strftime("%Y-%m-%d %H:%M:%S")

    # Store reset token in a simple way — reuse sessions table with a prefix
    db.execute(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
        (f"reset:{reset_token}", row["id"], expires),
    )
    db.commit()

    try:
        delivered = _send_reset_email(body.email.lower(), reset_token)
    except (OSError, smtplib.SMTPException):
        delivered = False

    if not delivered and not EXPOSE_RESET_TOKEN:
        db.execute("DELETE FROM sessions WHERE token = ?", (f"reset:{reset_token}",))
        db.commit()

    response = {
        "detail": "If an account with that email exists, a reset link has been sent."
    }
    if EXPOSE_RESET_TOKEN:
        response["reset_token"] = reset_token
    return response


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest):
    """Reset password using a reset token."""
    _validate_password(body.password)

    db = get_auth_db()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    row = db.execute(
        "SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?",
        (f"reset:{body.token}", now),
    ).fetchone()

    if not row:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired reset token. Please request a new one.",
        )

    pw_hash = hash_password(body.password)
    db.execute(
        """
        UPDATE users SET password_hash = ?, is_verified = 1,
               updated_at = datetime('now')
        WHERE id = ?
        """,
        (pw_hash, row["user_id"]),
    )
    # The reset link proves mailbox ownership: drop the used token and every
    # other session, so nobody who knew the old password stays signed in.
    db.execute("DELETE FROM sessions WHERE user_id = ?", (row["user_id"],))
    db.commit()

    return {"detail": "Password reset successfully. You can now sign in with your new password."}


# ── Admin endpoints ──────────────────────────────────────────────────

@router.get("/admin/users")
def admin_list_users(authorization: Optional[str] = Header(None)):
    """List all registered users. Admin only (rkdevanda65@gmail.com)."""
    current = get_current_user(authorization)
    if not current:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not _is_admin(current):
        raise HTTPException(status_code=403, detail="Admin access only")

    db = get_auth_db()
    rows = db.execute(
        """
        SELECT id, email, name, auth_provider, avatar_url, is_verified,
               created_at, updated_at, last_login, COALESCE(login_count, 0) as login_count,
               (SELECT COUNT(*) FROM sessions s WHERE s.user_id = users.id
                AND s.expires_at > datetime('now')
                AND s.token NOT LIKE 'reset:%') as active_sessions
        FROM users ORDER BY created_at DESC
        """
    ).fetchall()

    return [
        {
            "id": r["id"],
            "email": r["email"],
            "name": r["name"],
            "auth_provider": r["auth_provider"],
            "avatar_url": r["avatar_url"],
            "is_verified": bool(r["is_verified"]),
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
            "last_login": r["last_login"],
            "login_count": r["login_count"],
            "active_sessions": r["active_sessions"],
        }
        for r in rows
    ]


@router.get("/admin/stats")
def admin_stats(authorization: Optional[str] = Header(None)):
    """Quick platform stats. Admin only."""
    current = get_current_user(authorization)
    if not current:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not _is_admin(current):
        raise HTTPException(status_code=403, detail="Admin access only")

    db = get_auth_db()
    total = db.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
    google_users = db.execute(
        "SELECT COUNT(*) as c FROM users WHERE auth_provider = 'google'"
    ).fetchone()["c"]
    email_users = db.execute(
        "SELECT COUNT(*) as c FROM users WHERE auth_provider = 'email'"
    ).fetchone()["c"]
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    active_sessions = db.execute(
        "SELECT COUNT(*) as c FROM sessions WHERE expires_at > ? AND token NOT LIKE 'reset:%'",
        (now,),
    ).fetchone()["c"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_signups = db.execute(
        "SELECT COUNT(*) as c FROM users WHERE created_at >= ?", (today,)
    ).fetchone()["c"]

    return {
        "total_users": total,
        "google_users": google_users,
        "email_users": email_users,
        "active_sessions": active_sessions,
        "today_signups": today_signups,
    }


@router.post("/admin/reset-password")
def admin_reset_password(
    body: AdminResetPasswordRequest,
    authorization: Optional[str] = Header(None),
):
    """Admin can reset any user's password."""
    current = get_current_user(authorization)
    if not current:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not _is_admin(current):
        raise HTTPException(status_code=403, detail="Admin access only")

    _validate_password(body.new_password)

    db = get_auth_db()
    user = db.execute("SELECT id, email FROM users WHERE id = ?", (body.user_id,)).fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    pw_hash = hash_password(body.new_password)
    db.execute(
        "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
        (pw_hash, body.user_id),
    )
    db.commit()
    return {"detail": f"Password reset for {user['email']}"}


@router.post("/admin/sql")
def admin_sql_query(
    body: AdminSqlQueryRequest,
    authorization: Optional[str] = Header(None),
):
    """Run a read-only SQL query against the historical database."""
    current = get_current_user(authorization)
    if not current:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not _is_admin(current):
        raise HTTPException(status_code=403, detail="Admin access only")

    sql = (body.sql or "").strip()
    if not sql:
        raise HTTPException(status_code=400, detail="SQL query is required")

    lowered = sql.lower()
    if not (
        lowered.startswith("select")
        or lowered.startswith("with")
        or lowered.startswith("pragma")
    ):
        raise HTTPException(
            status_code=400,
            detail="Only read-only SQL queries are allowed.",
        )

    conn = get_db()
    try:
        result = conn.execute(sql)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SQL error: {exc}")

    columns = [desc[0] for desc in result.description]
    rows = [dict(zip(columns, row)) for row in result.fetchall()]
    return {"columns": columns, "rows": rows, "count": len(rows)}


@router.get("/admin/sql-schema")
def admin_sql_schema(authorization: Optional[str] = Header(None)):
    """Return the database table and column schema for admin SQL building."""
    current = get_current_user(authorization)
    if not current:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not _is_admin(current):
        raise HTTPException(status_code=403, detail="Admin access only")

    try:
        rows = query(
            """
            SELECT table_schema, table_name, column_name, data_type AS column_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'main'
            ORDER BY table_schema, table_name, ordinal_position
            """
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Schema query failed: {exc}")

    schema = {}
    for row in rows:
        table_name = row["table_name"]
        if table_name not in schema:
            schema[table_name] = {
                "schema": row["table_schema"],
                "table": table_name,
                "columns": [],
            }
        schema[table_name]["columns"].append(
            {
                "name": row["column_name"],
                "type": row["column_type"],
                "nullable": row["is_nullable"],
            }
        )

    return {"tables": list(schema.values())}


# ── Google OAuth ─────────────────────────────────────────────────────

@router.post("/google", response_model=AuthResponse)
def google_login(body: GoogleLoginRequest):
    """Verify a Google ID token and create/login the user."""
    url = (
        f"https://oauth2.googleapis.com/tokeninfo?id_token={body.credential}"
    )
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError):
        raise HTTPException(
            status_code=401, detail="Invalid Google credential"
        )

    if GOOGLE_CLIENT_ID and data.get("aud") != GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=401, detail="Google token audience mismatch"
        )

    google_id = data.get("sub")
    email = data.get("email", "").lower()
    name = data.get("name", email.split("@")[0])
    picture = data.get("picture")

    if not email:
        raise HTTPException(
            status_code=401, detail="Google account has no email"
        )
    if str(data.get("email_verified", "")).lower() != "true":
        raise HTTPException(
            status_code=401, detail="Google account email is not verified"
        )
    if not _is_admin_email(email):
        raise HTTPException(status_code=403, detail=ADMIN_ONLY_DETAIL)

    db = get_auth_db()

    row = db.execute(
        "SELECT * FROM users WHERE google_id = ? OR email = ?",
        (google_id, email),
    ).fetchone()

    if row:
        user_id = row["id"]
        if not row["is_verified"]:
            # An unverified email/password account may have been registered by
            # someone else squatting this address. Google proves ownership, so
            # drop that password and its sessions before linking.
            db.execute(
                "UPDATE users SET password_hash = NULL WHERE id = ?", (user_id,)
            )
            db.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        db.execute(
            """
            UPDATE users
            SET google_id = ?, avatar_url = COALESCE(?, avatar_url),
                is_verified = 1, updated_at = datetime('now')
            WHERE id = ?
            """,
            (google_id, picture, user_id),
        )
        db.commit()
    else:
        user_id = str(uuid4())
        db.execute(
            """
            INSERT INTO users (id, email, name, auth_provider, google_id,
                               avatar_url, is_verified)
            VALUES (?, ?, ?, 'google', ?, ?, 1)
            """,
            (user_id, email, name, google_id, picture),
        )
        db.commit()

    # Track login
    db.execute(
        "UPDATE users SET last_login = datetime('now'), login_count = COALESCE(login_count, 0) + 1 WHERE id = ?",
        (user_id,),
    )
    db.commit()

    user_row = db.execute(
        "SELECT * FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    token = _create_session(user_id)
    return {"token": token, "user": _user_dict(user_row)}
