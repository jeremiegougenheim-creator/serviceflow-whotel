"""
Lauds Federated Learning — Package

Exports the main classes for the Lauds FL system.

Architecture:
    - LaudsModelWeights  — consumption coefficient matrix (9 stations × 6 nat groups × 7 DOW)
    - LaudsNumpyClient   — Flower NumPy client; trains locally, sends DP-noised updates only
    - LaudsStrategy      — Flower server strategy (FedAvg + adaptive epochs + round logging)
    - GaussianMechanism  — (ε, δ)-DP Gaussian noise mechanism
    - PrivacyAccountant  — Rényi DP composition tracking over FL rounds
    - clip_and_noise     — Combined clip + Gaussian noise helper
    - run_client         — Entry point for starting a property FL client
    - run_server         — Entry point for starting the Lauds aggregation server
"""

from .client import (
    LaudsModelWeights,
    LaudsNumpyClient,
    run_client,
    STATION_SLUGS,
    NAT_GROUP_LABELS,
    N_STATIONS,
    N_NAT_GROUPS,
    N_DOW,
)
from .server import (
    LaudsStrategy,
    run_server,
)
from .privacy import (
    GaussianMechanism,
    PrivacyAccountant,
    PrivacyCost,
    clip_and_noise,
    clip_gradients,
    compute_noise_multiplier,
)

__all__ = [
    # Client
    "LaudsModelWeights",
    "LaudsNumpyClient",
    "run_client",
    "STATION_SLUGS",
    "NAT_GROUP_LABELS",
    "N_STATIONS",
    "N_NAT_GROUPS",
    "N_DOW",
    # Server
    "LaudsStrategy",
    "run_server",
    # Privacy
    "GaussianMechanism",
    "PrivacyAccountant",
    "PrivacyCost",
    "clip_and_noise",
    "clip_gradients",
    "compute_noise_multiplier",
]
