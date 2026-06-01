import base64
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.config import get_settings
from app.firebase_config import get_firebase_auth, get_firebase_db
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    SessionResponse,
    UserResponse,
    UserUpdateRequest,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100000,
    )
    return _b64url_encode(digest), salt


def _verify_password(password: str, password_hash: str, salt: str) -> bool:
    calculated_hash, _ = _hash_password(password, salt)
    return hmac.compare_digest(calculated_hash, password_hash)


def _sign_token(payload: dict[str, Any], secret_key: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    encoded_header = _b64url_encode(
        json.dumps(header, separators=(",", ":")).encode("utf-8")
    )
    encoded_payload = _b64url_encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    signing_input = f"{encoded_header}.{encoded_payload}".encode("ascii")
    signature = hmac.new(
        secret_key.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    return f"{encoded_header}.{encoded_payload}.{_b64url_encode(signature)}"


def _decode_token(token: str, secret_key: str) -> dict[str, Any]:
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token.",
        ) from exc

    signing_input = f"{encoded_header}.{encoded_payload}".encode("ascii")
    expected_signature = hmac.new(
        secret_key.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(_b64url_encode(expected_signature), encoded_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token signature.",
        )

    payload = json.loads(_b64url_decode(encoded_payload))
    expires_at = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    if expires_at <= _utc_now():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has expired.",
        )
    return payload


@dataclass
class UserRecord:
    id: str
    email: str
    full_name: str
    role: str
    password_hash: str
    salt: str
    created_at: datetime

    def to_response(self) -> UserResponse:
        return UserResponse(
            id=self.id,
            email=self.email,
            full_name=self.full_name,
            role=self.role,
            created_at=self.created_at,
        )


@dataclass
class SessionRecord:
    id: str
    user_id: str
    user_email: str
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None = None

    def to_response(self) -> SessionResponse:
        return SessionResponse(
            id=self.id,
            user_id=self.user_id,
            user_email=self.user_email,
            created_at=self.created_at,
            expires_at=self.expires_at,
            revoked_at=self.revoked_at,
            is_active=self.revoked_at is None and self.expires_at > _utc_now(),
        )


class LocalAuthService:
    def __init__(self, storage_dir: Path) -> None:
        self._storage_dir = storage_dir
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._users_path = self._storage_dir / "users.json"
        self._sessions_path = self._storage_dir / "sessions.json"
        self._lock = Lock()
        self._initialize_file(self._users_path, {})
        self._initialize_file(self._sessions_path, {})

    def register(self, payload: RegisterRequest) -> UserResponse:
        with self._lock:
            users = self._read_json(self._users_path)
            existing = self._find_user_by_email(users, payload.email)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A user with this email already exists.",
                )

            user_id = str(uuid4())
            password_hash, salt = _hash_password(payload.password)
            created_at = _utc_now()
            users[user_id] = {
                "name": payload.full_name,
                "email": payload.email,
                "role": payload.role,
                "password_hash": password_hash,
                "salt": salt,
                "created_at": created_at.isoformat(),
            }
            self._write_json(self._users_path, users)
            return UserRecord(
                id=user_id,
                email=payload.email,
                full_name=payload.full_name,
                role=payload.role,
                password_hash=password_hash,
                salt=salt,
                created_at=created_at,
            ).to_response()

    def user_count(self) -> int:
        with self._lock:
            users = self._read_json(self._users_path)
            return len(users)

    def login(self, payload: LoginRequest) -> UserResponse:
        with self._lock:
            users = self._read_json(self._users_path)
            user_record = self._find_user_by_email(users, payload.email)
            if not user_record:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password.",
                )

            user = self._dict_to_user(user_record[0], user_record[1])
            if not _verify_password(payload.password, user.password_hash, user.salt):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password.",
                )
            return user.to_response()

    def get_user(self, user_id: str) -> UserResponse:
        with self._lock:
            users = self._read_json(self._users_path)
            return self._get_user_record(users, user_id).to_response()

    def get_user_by_email(self, email: str) -> UserResponse:
        with self._lock:
            users = self._read_json(self._users_path)
            user_record = self._find_user_by_email(users, email)
            if not user_record:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found.",
                )
            return self._dict_to_user(user_record[0], user_record[1]).to_response()

    def list_users(self) -> list[UserResponse]:
        with self._lock:
            users = self._read_json(self._users_path)
            records = [
                self._dict_to_user(user_id, payload).to_response()
                for user_id, payload in users.items()
            ]
            records.sort(key=lambda item: item.created_at)
            return records

    def update_user(self, user_id: str, payload: UserUpdateRequest) -> UserResponse:
        with self._lock:
            users = self._read_json(self._users_path)
            user = self._get_user_record(users, user_id)
            stored = users[user_id]
            if payload.full_name is not None:
                stored["name"] = payload.full_name
            if payload.role is not None:
                stored["role"] = payload.role
            if payload.password is not None:
                stored["password_hash"], stored["salt"] = _hash_password(payload.password)
            self._write_json(self._users_path, users)
            return self._dict_to_user(user.id, stored).to_response()

    def delete_user(self, user_id: str) -> None:
        with self._lock:
            users = self._read_json(self._users_path)
            if user_id not in users:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found.",
                )
            del users[user_id]
            self._write_json(self._users_path, users)

            sessions = self._read_json(self._sessions_path)
            updated = False
            for session in sessions.values():
                if session["user_id"] == user_id and session.get("revoked_at") is None:
                    session["revoked_at"] = _utc_now().isoformat()
                    updated = True
            if updated:
                self._write_json(self._sessions_path, sessions)

    def create_session(self, user: UserResponse, expires_in: int) -> SessionResponse:
        with self._lock:
            sessions = self._read_json(self._sessions_path)
            now = _utc_now()
            session_id = str(uuid4())
            sessions[session_id] = {
                "user_id": user.id,
                "user_email": user.email,
                "created_at": now.isoformat(),
                "expires_at": (now + timedelta(seconds=expires_in)).isoformat(),
                "revoked_at": None,
            }
            self._write_json(self._sessions_path, sessions)
            return self._dict_to_session(session_id, sessions[session_id]).to_response()

    def get_session(self, session_id: str) -> SessionResponse:
        with self._lock:
            sessions = self._read_json(self._sessions_path)
            if session_id not in sessions:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session not found.",
                )
            return self._dict_to_session(session_id, sessions[session_id]).to_response()

    def list_sessions(self, user_id: str) -> list[SessionResponse]:
        with self._lock:
            sessions = self._read_json(self._sessions_path)
            result = [
                self._dict_to_session(session_id, payload).to_response()
                for session_id, payload in sessions.items()
                if payload["user_id"] == user_id
            ]
            result.sort(key=lambda item: item.created_at, reverse=True)
            return result

    def revoke_session(self, session_id: str) -> None:
        with self._lock:
            sessions = self._read_json(self._sessions_path)
            if session_id not in sessions:
                return
            if sessions[session_id].get("revoked_at") is None:
                sessions[session_id]["revoked_at"] = _utc_now().isoformat()
                self._write_json(self._sessions_path, sessions)

    def revoke_all_sessions(self, user_id: str) -> int:
        with self._lock:
            sessions = self._read_json(self._sessions_path)
            revoked_count = 0
            now = _utc_now().isoformat()
            for session in sessions.values():
                if session["user_id"] == user_id and session.get("revoked_at") is None:
                    session["revoked_at"] = now
                    revoked_count += 1
            if revoked_count:
                self._write_json(self._sessions_path, sessions)
            return revoked_count

    def _initialize_file(self, path: Path, default_value: dict[str, Any]) -> None:
        if not path.exists():
            path.write_text(json.dumps(default_value, indent=2), encoding="utf-8")

    def _read_json(self, path: Path) -> dict[str, Any]:
        raw = path.read_text(encoding="utf-8").strip()
        if not raw:
            return {}
        return json.loads(raw)

    def _write_json(self, path: Path, payload: dict[str, Any]) -> None:
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _get_user_record(self, users: dict[str, Any], user_id: str) -> UserRecord:
        payload = users.get(user_id)
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )
        return self._dict_to_user(user_id, payload)

    def _find_user_by_email(
        self, users: dict[str, Any], email: str
    ) -> tuple[str, dict[str, Any]] | None:
        normalized_email = email.strip().lower()
        for user_id, payload in users.items():
            if payload["email"].strip().lower() == normalized_email:
                return user_id, payload
        return None

    def _dict_to_user(self, user_id: str, payload: dict[str, Any]) -> UserRecord:
        return UserRecord(
            id=user_id,
            email=payload["email"],
            full_name=payload["name"],
            role=payload["role"],
            password_hash=payload["password_hash"],
            salt=payload["salt"],
            created_at=datetime.fromisoformat(payload["created_at"]),
        )

    def _dict_to_session(self, session_id: str, payload: dict[str, Any]) -> SessionRecord:
        revoked_at = payload.get("revoked_at")
        return SessionRecord(
            id=session_id,
            user_id=payload["user_id"],
            user_email=payload["user_email"],
            created_at=datetime.fromisoformat(payload["created_at"]),
            expires_at=datetime.fromisoformat(payload["expires_at"]),
            revoked_at=datetime.fromisoformat(revoked_at) if revoked_at else None,
        )


class FirebaseAuthService:
    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise RuntimeError("FIREBASE_API_KEY is required for Firebase auth.")
        self.api_key = api_key
        self.base_url = "https://identitytoolkit.googleapis.com/v1"
        self.auth = get_firebase_auth()
        self.db = get_firebase_db()

    def register(self, payload: RegisterRequest) -> UserResponse:
        signup = self._post(
            "accounts:signUp",
            {"email": payload.email, "password": payload.password, "returnSecureToken": True},
        )
        self._post(
            "accounts:update",
            {"idToken": signup["idToken"], "displayName": payload.full_name, "returnSecureToken": True},
        )
        user = UserResponse(
            id=signup["localId"],
            email=payload.email,
            full_name=payload.full_name,
            role=payload.role,
            created_at=_utc_now(),
        )
        self.db.child("users").child(user.id).set(
            {
                "name": user.full_name,
                "email": user.email,
                "role": user.role,
                "created_at": user.created_at.isoformat(),
            }
        )
        return user

    def user_count(self) -> int:
        users = self.db.child("users").get().val() or {}
        return len(users)

    def login(self, payload: LoginRequest) -> UserResponse:
        result = self._post(
            "accounts:signInWithPassword",
            {"email": payload.email, "password": payload.password, "returnSecureToken": True},
        )
        user_data = self.db.child("users").child(result["localId"]).get().val() or {}
        return UserResponse(
            id=result["localId"],
            email=result["email"],
            full_name=user_data.get("name") or result.get("displayName") or result["email"],
            role=user_data.get("role", "user"),
            created_at=datetime.fromisoformat(user_data["created_at"])
            if user_data.get("created_at")
            else _utc_now(),
        )

    def get_user(self, user_id: str) -> UserResponse:
        payload = self.db.child("users").child(user_id).get().val()
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )
        return self._db_user_to_response(user_id, payload)

    def get_user_by_email(self, email: str) -> UserResponse:
        users = self.db.child("users").get().val() or {}
        normalized = email.strip().lower()
        for user_id, payload in users.items():
            if payload.get("email", "").strip().lower() == normalized:
                return self._db_user_to_response(user_id, payload)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    def list_users(self) -> list[UserResponse]:
        users = self.db.child("users").get().val() or {}
        result = [self._db_user_to_response(user_id, payload) for user_id, payload in users.items()]
        result.sort(key=lambda item: item.created_at)
        return result

    def update_user(self, user_id: str, payload: UserUpdateRequest) -> UserResponse:
        existing = self.db.child("users").child(user_id).get().val()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )
        updates: dict[str, Any] = {}
        if payload.full_name is not None:
            updates["name"] = payload.full_name
        if payload.role is not None:
            updates["role"] = payload.role
        if updates:
            self.db.child("users").child(user_id).update(updates)
            existing.update(updates)
        if payload.password is not None:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="Firebase password updates require a secure privileged workflow.",
            )
        return self._db_user_to_response(user_id, existing)

    def delete_user(self, user_id: str) -> None:
        existing = self.db.child("users").child(user_id).get().val()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )
        self.db.child("users").child(user_id).remove()
        self.revoke_all_sessions(user_id)

    def create_session(self, user: UserResponse, expires_in: int) -> SessionResponse:
        session_id = str(uuid4())
        now = _utc_now()
        session = SessionResponse(
            id=session_id,
            user_id=user.id,
            user_email=user.email,
            created_at=now,
            expires_at=now + timedelta(seconds=expires_in),
            revoked_at=None,
            is_active=True,
        )
        self.db.child("sessions").child(session_id).set(
            {
                "user_id": session.user_id,
                "user_email": session.user_email,
                "created_at": session.created_at.isoformat(),
                "expires_at": session.expires_at.isoformat(),
                "revoked_at": None,
            }
        )
        return session

    def get_session(self, session_id: str) -> SessionResponse:
        payload = self.db.child("sessions").child(session_id).get().val()
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session not found.",
            )
        return self._db_session_to_response(session_id, payload)

    def list_sessions(self, user_id: str) -> list[SessionResponse]:
        sessions = self.db.child("sessions").get().val() or {}
        result = [
            self._db_session_to_response(session_id, payload)
            for session_id, payload in sessions.items()
            if payload.get("user_id") == user_id
        ]
        result.sort(key=lambda item: item.created_at, reverse=True)
        return result

    def revoke_session(self, session_id: str) -> None:
        existing = self.db.child("sessions").child(session_id).get().val()
        if existing and existing.get("revoked_at") is None:
            self.db.child("sessions").child(session_id).update(
                {"revoked_at": _utc_now().isoformat()}
            )

    def revoke_all_sessions(self, user_id: str) -> int:
        sessions = self.db.child("sessions").get().val() or {}
        revoked = 0
        now = _utc_now().isoformat()
        for session_id, payload in sessions.items():
            if payload.get("user_id") == user_id and payload.get("revoked_at") is None:
                self.db.child("sessions").child(session_id).update({"revoked_at": now})
                revoked += 1
        return revoked

    def _db_user_to_response(self, user_id: str, payload: dict[str, Any]) -> UserResponse:
        return UserResponse(
            id=user_id,
            email=payload["email"],
            full_name=payload["name"],
            role=payload["role"],
            created_at=datetime.fromisoformat(payload["created_at"]),
        )

    def _db_session_to_response(self, session_id: str, payload: dict[str, Any]) -> SessionResponse:
        revoked_at = payload.get("revoked_at")
        expires_at = datetime.fromisoformat(payload["expires_at"])
        return SessionResponse(
            id=session_id,
            user_id=payload["user_id"],
            user_email=payload["user_email"],
            created_at=datetime.fromisoformat(payload["created_at"]),
            expires_at=expires_at,
            revoked_at=datetime.fromisoformat(revoked_at) if revoked_at else None,
            is_active=revoked_at is None and expires_at > _utc_now(),
        )

    def _post(self, action: str, payload: dict[str, Any]) -> dict[str, Any]:
        import httpx

        url = f"{self.base_url}/{action}?key={self.api_key}"
        try:
            response = httpx.post(url, json=payload, timeout=15.0)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.json().get("error", {}).get("message", "Firebase request failed.")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to reach Firebase authentication service.",
            ) from exc


class AuthManager:
    def __init__(self) -> None:
        self.settings = get_settings()
        if self.settings.auth_provider == "firebase":
            self.provider = FirebaseAuthService(self.settings.firebase_api_key)
        else:
            self.provider = LocalAuthService(self.settings.storage_dir)

    def register(self, payload: RegisterRequest) -> UserResponse:
        return self.provider.register(payload)

    def user_count(self) -> int:
        return self.provider.user_count()

    def login(self, payload: LoginRequest) -> UserResponse:
        return self.provider.login(payload)

    def create_access_token(self, user: UserResponse) -> tuple[str, int, SessionResponse]:
        expires_in = self.settings.token_expire_minutes * 60
        session = self.provider.create_session(user, expires_in)
        payload = {
            "sub": user.id,
            "sid": session.id,
            "role": user.role,
            "name": user.full_name,
            "exp": int(session.expires_at.timestamp()),
        }
        token = _sign_token(payload, self.settings.secret_key)
        return token, expires_in, session

    def get_current_user(self, token: str) -> UserResponse:
        payload = _decode_token(token, self.settings.secret_key)
        session = self.provider.get_session(payload["sid"])
        if not session.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Access token has been revoked.",
            )
        return self.provider.get_user(payload["sub"])

    def get_token_payload(self, token: str) -> dict[str, Any]:
        return _decode_token(token, self.settings.secret_key)

    def list_users(self) -> list[UserResponse]:
        return self.provider.list_users()

    def get_user(self, user_id: str) -> UserResponse:
        return self.provider.get_user(user_id)

    def update_user(self, user_id: str, payload: UserUpdateRequest) -> UserResponse:
        return self.provider.update_user(user_id, payload)

    def delete_user(self, user_id: str) -> None:
        self.provider.delete_user(user_id)

    def list_sessions(self, user_id: str) -> list[SessionResponse]:
        return self.provider.list_sessions(user_id)

    def revoke_token(self, token: str) -> None:
        payload = self.get_token_payload(token)
        self.provider.revoke_session(payload["sid"])

    def revoke_all_sessions(self, user_id: str) -> int:
        return self.provider.revoke_all_sessions(user_id)


auth_manager = AuthManager()
