class AICompanyOSError(Exception):
    """Base error suitable for a concise CLI message."""


class ContractError(AICompanyOSError):
    """A structured document does not satisfy its public contract."""


class PrivacyError(AICompanyOSError):
    """A requested operation would cross the public/private boundary."""


class PolicyError(AICompanyOSError):
    """An operation violates an autonomy or resource policy."""


class ApprovalRequired(PolicyError):
    """Captain approval must be recorded before an operation can continue."""
