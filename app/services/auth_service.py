import base64
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.config import get_settings
from app.schemas.auth import LoginRequest, RegisterRequest, UserResponse, UserUpdateRequest


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


class MemoryAuthService:
    def __init__(self) -> None:
        self._users_by_email: dict[str, UserRecord] = {}

    def register(self, payload: RegisterRequest) -> UserResponse:
        email = payload.email.lower()
        if email in self._users_by_email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email already exists.",
            )

        password_hash, salt = _hash_password(payload.password)
        user = UserRecord(
            id=str(uuid4()),
            email=email,
            full_name=payload.full_name,
            role=payload.role,
            password_hash=password_hash,
            salt=salt,
            created_at=_utc_now(),
        )
        self._users_by_email[email] = user
        return user.to_response()

    def login(self, payload: LoginRequest) -> UserResponse:
        email = payload.email.lower()
        user = self._users_by_email.get(email)
        if not user or not _verify_password(payload.password, user.password_hash, user.salt):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )
        return user.to_response()

    def get_user(self, email: str) -> UserResponse:
        user = self._users_by_email.get(email.lower())
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )
        return user.to_response()

    def get_user_record(self, email: str) -> UserRecord:
        user = self._users_by_email.get(email.lower())
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )
        return user

    def update_user(self, email: str, payload: UserUpdateRequest) -> UserResponse:
        user = self.get_user_record(email)
        if payload.full_name is not None:
            user.full_name = payload.full_name
        if payload.role is not None:
            user.role = payload.role
        if payload.password is not None:
            user.password_hash, user.salt = _hash_password(payload.password)
        return user.to_response()


class FirebaseAuthService:
    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise RuntimeError("FIREBASE_API_KEY is required for Firebase auth.")
        self.api_key = api_key
        self.base_url = "https://identitytoolkit.googleapis.com/v1"

    def register(self, payload: RegisterRequest) -> UserResponse:
        signup = self._post(
            "accounts:signUp",
            {"email": payload.email, "password": payload.password, "returnSecureToken": True},
        )
        self._post(
            "accounts:update",
            {"idToken": signup["idToken"], "displayName": payload.full_name, "returnSecureToken": True},
        )
        return UserResponse(
            id=signup["localId"],
            email=payload.email,
            full_name=payload.full_name,
            role=payload.role,
            created_at=_utc_now(),
        )

    def login(self, payload: LoginRequest) -> UserResponse:
        result = self._post(
            "accounts:signInWithPassword",
            {"email": payload.email, "password": payload.password, "returnSecureToken": True},
        )
        return UserResponse(
            id=result["localId"],
            email=result["email"],
            full_name=result.get("displayName") or result["email"],
            role="user",
            created_at=_utc_now(),
        )

    def get_user(self, email: str) -> UserResponse:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Firebase profile lookup is not implemented without a backing user store.",
        )

    def update_user(self, email: str, payload: UserUpdateRequest) -> UserResponse:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Firebase user update is not implemented without a backing user store.",
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
        self.revoked_tokens: set[str] = set()
        if self.settings.auth_provider == "firebase":
            self.provider = FirebaseAuthService(self.settings.firebase_api_key)
        else:
            self.provider = MemoryAuthService()

    def register(self, payload: RegisterRequest) -> UserResponse:
        return self.provider.register(payload)

    def login(self, payload: LoginRequest) -> UserResponse:
        return self.provider.login(payload)

    def create_access_token(self, user: UserResponse) -> tuple[str, int]:
        expires_in = self.settings.token_expire_minutes * 60
        expires_at = _utc_now() + timedelta(seconds=expires_in)
        payload = {
            "sub": user.email,
            "role": user.role,
            "name": user.full_name,
            "exp": int(expires_at.timestamp()),
        }
        token = _sign_token(payload, self.settings.secret_key)
        return token, expires_in

    def get_current_user(self, token: str) -> UserResponse:
        if token in self.revoked_tokens:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Access token has been revoked.",
            )
        payload = _decode_token(token, self.settings.secret_key)
        return self.provider.get_user(payload["sub"])

    def update_user(self, email: str, payload: UserUpdateRequest) -> UserResponse:
        return self.provider.update_user(email, payload)

    def revoke_token(self, token: str) -> None:
        self.revoked_tokens.add(token)


auth_manager = AuthManager()
