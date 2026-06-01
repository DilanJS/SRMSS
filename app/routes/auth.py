from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.schemas.auth import (
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    UserUpdateRequest,
)
from app.services.auth_service import auth_manager

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _extract_bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is required.",
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must use Bearer token format.",
        )
    return token


def get_current_user(token: Annotated[str, Depends(_extract_bearer_token)]) -> UserResponse:
    return auth_manager.get_current_user(token)


def require_roles(*allowed_roles: str):
    def dependency(current_user: Annotated[UserResponse, Depends(get_current_user)]) -> UserResponse:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return current_user

    return dependency


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest) -> TokenResponse:
    user = auth_manager.register(payload)
    access_token, expires_in = auth_manager.create_access_token(user)
    return TokenResponse(access_token=access_token, expires_in=expires_in, user=user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest) -> TokenResponse:
    user = auth_manager.login(payload)
    access_token, expires_in = auth_manager.create_access_token(user)
    return TokenResponse(access_token=access_token, expires_in=expires_in, user=user)


@router.get("/me", response_model=UserResponse)
def me(current_user: Annotated[UserResponse, Depends(get_current_user)]) -> UserResponse:
    return current_user


@router.post("/logout", response_model=MessageResponse)
def logout(token: Annotated[str, Depends(_extract_bearer_token)]) -> MessageResponse:
    auth_manager.revoke_token(token)
    return MessageResponse(message="Session closed successfully.")


@router.patch("/me", response_model=UserResponse)
def update_me(
    payload: UserUpdateRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
) -> UserResponse:
    return auth_manager.update_user(current_user.email, payload)


@router.patch("/users/{email}", response_model=UserResponse)
def update_user(
    email: str,
    payload: UserUpdateRequest,
    _: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> UserResponse:
    return auth_manager.update_user(email, payload)
