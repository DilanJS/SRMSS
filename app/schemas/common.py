from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int
    summary: dict[str, Any] = {}


def paginate(
    items: list,
    page: int,
    page_size: int,
    summary: dict[str, Any] | None = None,
) -> "PaginatedResponse":
    total = len(items)
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = min(max(page, 1), total_pages)
    start = (page - 1) * page_size
    return PaginatedResponse(
        items=items[start : start + page_size],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        summary=summary or {},
    )
