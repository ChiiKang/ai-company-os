"""Validation contract for hostile repository/dependency experiments.

This foundation validates an execution envelope; a future container adapter must
translate it without weakening any field.
"""

from __future__ import annotations

from pathlib import Path

from .errors import PolicyError

TOP_LEVEL = {"network", "network_approval_id", "measured_network_behavior", "credentials", "privileged", "host_container_socket", "mounts", "resources", "staging"}


def _within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def validate_untrusted_execution(document: dict, *, allowed_staging_roots: list[str | Path]) -> dict:
    if not isinstance(document, dict) or set(document) - TOP_LEVEL:
        raise PolicyError("sandbox policy has unknown fields")
    required = TOP_LEVEL - {"network_approval_id", "measured_network_behavior"}
    if not required <= set(document):
        raise PolicyError("sandbox policy is missing required hostile-code controls")

    network = document["network"]
    if network != "none":
        if network != "approved-measured-only" or not document.get("network_approval_id") or not document.get("measured_network_behavior"):
            raise PolicyError("untrusted execution is offline unless measured network behavior has separate approval")
    if document["credentials"] != []:
        raise PolicyError("untrusted execution may not receive credentials")
    if document["privileged"] is not False or document["host_container_socket"] is not False:
        raise PolicyError("privileged mode and the host container socket are forbidden")

    mounts = document["mounts"]
    if not isinstance(mounts, dict) or set(mounts) != {"home", "knowledge", "scratch_output"}:
        raise PolicyError("sandbox mounts must declare only home, knowledge, and scratch output")
    if mounts["home"] is not False or mounts["knowledge"] is not False:
        raise PolicyError("home and private knowledge mounts are forbidden")
    scratch = mounts["scratch_output"]
    if (
        not isinstance(scratch, str)
        or not scratch.strip()
        or Path(scratch).is_absolute()
        or ".." in Path(scratch).parts
    ):
        raise PolicyError("one sandbox-relative scratch output mount is required")

    resources = document["resources"]
    expected_resources = {"cpus", "memory_mb", "pids", "timeout_seconds"}
    if not isinstance(resources, dict) or set(resources) != expected_resources:
        raise PolicyError("sandbox resources require bounded CPU, memory, PIDs, and timeout")
    limits = {"cpus": (0.1, 32), "memory_mb": (1, 131072), "pids": (1, 4096), "timeout_seconds": (1, 86400)}
    for key, (minimum, maximum) in limits.items():
        value = resources[key]
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not minimum <= value <= maximum:
            raise PolicyError(f"sandbox {key} must be bounded within the supported range")

    staging = document["staging"]
    expected_staging = {"separate_step", "credential_free", "destination"}
    if not isinstance(staging, dict) or set(staging) != expected_staging:
        raise PolicyError("staging must be a separate credential-free destination")
    if staging["separate_step"] is not True or staging["credential_free"] is not True:
        raise PolicyError("clone and dependency acquisition must be separate and credential-free")
    destination = Path(staging["destination"]).expanduser().resolve()
    roots = [Path(root).expanduser().resolve() for root in allowed_staging_roots]
    if not roots or not any(_within(destination, root) and destination != root for root in roots):
        raise PolicyError("staging destination is not beneath an explicit allowlisted root")
    return document
