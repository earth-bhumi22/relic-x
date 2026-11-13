"""Domain errors. Services raise these; the API layer maps them to HTTP.

Keeping HTTP status codes out of the service layer means services can be
reused from scripts and tests without FastAPI.
"""

from __future__ import annotations


class DomainError(Exception):
    code = "domain_error"
    status = 400

    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class NotFound(DomainError):
    code = "not_found"
    status = 404


class InvalidInput(DomainError):
    code = "invalid_input"
    status = 422


class PreconditionFailed(DomainError):
    """The request is valid but a previous pipeline step is missing."""

    code = "precondition_failed"
    status = 409


class PayloadTooLarge(DomainError):
    code = "payload_too_large"
    status = 413
