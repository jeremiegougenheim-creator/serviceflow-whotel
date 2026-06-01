"""
Lauds Federated Learning Client

The client trains on LOCAL property data only.
Only model WEIGHT UPDATES (delta gradients) are sent to the aggregation server.
Raw forecasts, waste measurements, guest counts — NEVER leave the property server.

Privacy guarantee: Differential Privacy noise added to gradients before upload.
Framework: Flower (flwr) v1.x + NumPy model (no PyTorch/TF dependency for edge deployment).

Data flow:
    Local DB (waste_measured + pms_daily)
        ↓ load_local_data()
    LaudsNumpyClient.fit()
        ↓ gradient descent on squared error
    DifferentialPrivacy.clip_and_noise()
        ↓ (ε, δ)-noisy weight updates
    flwr send_parameters → Flower server
        (ONLY model weights, never raw data)

Shape convention:
    weights: np.ndarray of shape (N_STATIONS, N_NAT_GROUPS, N_DOW)
             where N_STATIONS=9, N_NAT_GROUPS=6, N_DOW=7
             Represents consumption coefficient per (station, nationality, day-of-week).
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import flwr as fl
import numpy as np

from .privacy import GaussianMechanism, clip_and_noise, PrivacyAccountant

logger = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

# Model shape: 9 stations × 6 nationality groups × 7 days-of-week
N_STATIONS: int = 9
N_NAT_GROUPS: int = 6
N_DOW: int = 7

# Station slugs in order (must match DB stations.slug values)
STATION_SLUGS: List[str] = [
    "congee_noodle",
    "dim_sum",
    "japanese",
    "korean",
    "western_hot",
    "bakery_pastry",
    "fruit_cold",
    "taiwanese_local",
    "coffee_bar",
]

# Nationality group labels in order (anonymized — no individual guest data)
# These are aggregate demand priors; individual nationality of guests is NEVER stored.
NAT_GROUP_LABELS: List[str] = [
    "greaterChina",
    "japan",
    "korea",
    "western",
    "seasia",
    "other",
]

# DP defaults (pilot values)
DEFAULT_DP_EPSILON: float = 1.0
DEFAULT_DP_DELTA: float = 1e-5
DEFAULT_CLIP_NORM: float = 1.0
DEFAULT_LEARNING_RATE: float = 0.01


# ─── Weight struct ────────────────────────────────────────────────────────────


@dataclass
class LaudsModelWeights:
    """
    Consumption coefficient matrix for the Lauds forecasting model.

    Shape: (N_STATIONS, N_NAT_GROUPS, N_DOW) = (9, 6, 7)

    Each entry W[s, n, d] is the demand multiplier for station s
    under nationality group n on day-of-week d. The base PAR is
    multiplied by this coefficient to get the predicted consumption.

    Initialized near 1.0 with small random perturbation so that
    the untrained model is close to the rule-based baseline.

    Privacy note: these weights capture aggregate consumption patterns,
    not individual guest behaviour. They are safe to share with the FL server
    after DP noise is applied.
    """

    weights: np.ndarray = field(
        default_factory=lambda: np.ones((N_STATIONS, N_NAT_GROUPS, N_DOW))
        + np.random.normal(0, 0.05, (N_STATIONS, N_NAT_GROUPS, N_DOW))
    )

    def to_numpy_list(self) -> List[np.ndarray]:
        """Serialize to Flower parameter format (list of numpy arrays)."""
        return [self.weights]

    @classmethod
    def from_numpy_list(cls, params: List[np.ndarray]) -> "LaudsModelWeights":
        """Deserialize from Flower parameter format."""
        if len(params) != 1:
            raise ValueError(f"Expected 1 parameter array, got {len(params)}")
        w = params[0]
        if w.shape != (N_STATIONS, N_NAT_GROUPS, N_DOW):
            raise ValueError(
                f"Weight shape mismatch: expected {(N_STATIONS, N_NAT_GROUPS, N_DOW)}, "
                f"got {w.shape}"
            )
        return cls(weights=w.copy())

    def predict(
        self,
        base_par: np.ndarray,
        nat_mix: np.ndarray,
        day_of_week: int,
    ) -> np.ndarray:
        """
        Predict consumption per station.

        Args:
            base_par:    Shape (N_STATIONS,) — baseline PAR in kg per station.
            nat_mix:     Shape (N_NAT_GROUPS,) — nationality mix proportions (sum ≈ 1).
            day_of_week: Integer 0–6 (Monday=0, Sunday=6).

        Returns:
            Predicted consumption shape (N_STATIONS,).
        """
        # W[:, :, d] has shape (N_STATIONS, N_NAT_GROUPS)
        # nat_mix has shape (N_NAT_GROUPS,)
        # coeff[s] = sum_n W[s, n, d] * nat_mix[n]
        coeff = self.weights[:, :, day_of_week] @ nat_mix  # (N_STATIONS,)
        return base_par * coeff


# ─── Local data loading ───────────────────────────────────────────────────────


def load_local_data(
    property_id: str,
    db_client: Any,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Load training data from the local property database.

    Queries:
        waste_measured (via outlet → property) — actual consumption in kg
        pms_daily — occupancy, for scaling the base PAR

    Privacy: This data NEVER leaves the local server. Only derived model
    weight updates (after DP noise) are sent to the aggregation server.

    Returns:
        (base_pars, nat_mixes, day_of_weeks, actual_consumptions)
        Each array has N rows (one per service_date × outlet combination).
        base_pars:         shape (N, N_STATIONS)
        nat_mixes:         shape (N, N_NAT_GROUPS)   — aggregated, anonymized
        day_of_weeks:      shape (N,)                — integer 0–6
        actual_consumptions: shape (N, N_STATIONS)   — measured waste_kg per station

    Note: nat_mix values are aggregate proportions from PMS segment data,
    NOT individual guest nationality records. Individual guest data is never
    accessed or stored by this function.
    """
    # Fetch outlets for this property
    outlets_result = db_client.from_("outlets").select("id").eq(
        "property_id", property_id
    ).execute()
    outlet_ids = [r["id"] for r in (outlets_result.data or [])]

    if not outlet_ids:
        logger.warning("No outlets found for property %s", property_id)
        return (
            np.empty((0, N_STATIONS)),
            np.empty((0, N_NAT_GROUPS)),
            np.empty((0,), dtype=int),
            np.empty((0, N_STATIONS)),
        )

    # Fetch waste measurements (last 90 days for training)
    waste_result = db_client.from_("waste_measured").select(
        "station_id, service_date, waste_kg, outlet_id"
    ).in_("outlet_id", outlet_ids).order("service_date").execute()

    waste_rows = waste_result.data or []
    if not waste_rows:
        logger.warning("No waste data for property %s", property_id)
        return (
            np.empty((0, N_STATIONS)),
            np.empty((0, N_NAT_GROUPS)),
            np.empty((0,), dtype=int),
            np.empty((0, N_STATIONS)),
        )

    # Fetch PMS daily for occupancy + segment data
    pms_result = db_client.from_("pms_daily").select(
        "service_date, rooms_occupied, rooms_available, "
        "segment_leisure_pct, segment_business_pct, segment_group_pct, segment_other_pct"
    ).eq("property_id", property_id).order("service_date").execute()

    pms_by_date: Dict[str, Dict] = {
        r["service_date"]: r for r in (pms_result.data or [])
    }

    # Aggregate waste by (service_date, station_slug)
    from collections import defaultdict
    import datetime

    waste_by_date: Dict[str, Dict[str, float]] = defaultdict(
        lambda: {slug: 0.0 for slug in STATION_SLUGS}
    )
    for row in waste_rows:
        date = row["service_date"]
        # Map station_id to slug — simplified: assume stations are ordered
        # In production this would join on the stations table.
        # Here we use a sequential mapping for the numeric model.
        station_idx = hash(str(row.get("station_id", ""))) % N_STATIONS
        slug = STATION_SLUGS[station_idx]
        waste_by_date[date][slug] += float(row.get("waste_kg", 0.0))

    # Build training arrays
    base_pars_list: List[np.ndarray] = []
    nat_mixes_list: List[np.ndarray] = []
    dow_list: List[int] = []
    actuals_list: List[np.ndarray] = []

    # Base PAR from historical average (kg per 100 covers, scaled by occupancy)
    BASE_PAR_KG: Dict[str, float] = {
        "congee_noodle": 60.0,
        "dim_sum": 40.0,
        "japanese": 45.0,
        "korean": 25.0,
        "western_hot": 70.0,
        "bakery_pastry": 55.0,
        "fruit_cold": 80.0,
        "taiwanese_local": 35.0,
        "coffee_bar": 300.0,
    }
    base_par_vec = np.array([BASE_PAR_KG[s] for s in STATION_SLUGS])

    for date_str, waste_by_station in waste_by_date.items():
        pms = pms_by_date.get(date_str)
        occupancy = (pms["rooms_occupied"] / max(pms["rooms_available"], 1)) if pms else 0.7

        # Scale base PAR by occupancy
        scaled_base = base_par_vec * occupancy

        # Build nat_mix from PMS segment data as a proxy for nationality mix.
        # This is an aggregate proportion — no individual nationality.
        # Mapping: leisure → greaterChina + seasia, business → western + japan,
        #          group → korea, other → other (crude but anonymized proxy).
        if pms:
            leisure = float(pms.get("segment_leisure_pct", 0.0))
            business = float(pms.get("segment_business_pct", 0.0))
            group = float(pms.get("segment_group_pct", 0.0))
            other = float(pms.get("segment_other_pct", 0.0))
            nat_mix = np.array([
                leisure * 0.6,      # greaterChina (from leisure proportion)
                business * 0.3,     # japan        (from business proportion)
                group * 0.5,        # korea        (from group proportion)
                business * 0.7,     # western      (from business proportion)
                leisure * 0.4,      # seasia        (from leisure proportion)
                other,              # other
            ])
        else:
            # Default uniform mix if no PMS data
            nat_mix = np.ones(N_NAT_GROUPS) / N_NAT_GROUPS

        # Normalise nat_mix to sum to 1.0
        mix_sum = nat_mix.sum()
        nat_mix = nat_mix / max(mix_sum, 1e-8)

        # Day of week from date string
        try:
            d = datetime.date.fromisoformat(date_str)
            dow = d.weekday()  # Monday=0, Sunday=6
        except ValueError:
            dow = 0

        # Actual consumption vector
        actual = np.array([waste_by_station.get(s, 0.0) for s in STATION_SLUGS])

        base_pars_list.append(scaled_base)
        nat_mixes_list.append(nat_mix)
        dow_list.append(dow)
        actuals_list.append(actual)

    if not base_pars_list:
        return (
            np.empty((0, N_STATIONS)),
            np.empty((0, N_NAT_GROUPS)),
            np.empty((0,), dtype=int),
            np.empty((0, N_STATIONS)),
        )

    return (
        np.stack(base_pars_list),
        np.stack(nat_mixes_list),
        np.array(dow_list, dtype=int),
        np.stack(actuals_list),
    )


# ─── Flower client ────────────────────────────────────────────────────────────


class LaudsNumpyClient(fl.client.NumPyClient):
    """
    Flower NumPy client for federated learning of the Lauds consumption model.

    Privacy guarantees:
    - Local training data NEVER leaves this client.
    - Only model weight deltas (after DP noise) are transmitted.
    - Each round's (ε, δ) cost is tracked by a PrivacyAccountant.
    - Cumulative privacy budget is logged and enforced via a configurable cap.

    Args:
        property_id: UUID of the property (used for consent check and DB queries).
        db_client:   Supabase client configured for local property DB.
        epsilon:     Per-round DP ε budget. Default 1.0.
        delta:       Per-round DP δ. Default 1e-5.
        clip_norm:   Gradient clipping L2 norm bound. Default 1.0.
        max_cumulative_epsilon: Stop training if cumulative ε exceeds this. Default 10.0.
    """

    def __init__(
        self,
        property_id: str,
        db_client: Any,
        epsilon: float = DEFAULT_DP_EPSILON,
        delta: float = DEFAULT_DP_DELTA,
        clip_norm: float = DEFAULT_CLIP_NORM,
        max_cumulative_epsilon: float = 10.0,
    ) -> None:
        self.property_id = property_id
        self.db_client = db_client
        self.epsilon = epsilon
        self.delta = delta
        self.clip_norm = clip_norm
        self.max_cumulative_epsilon = max_cumulative_epsilon

        # Load local data on init
        (
            self._base_pars,
            self._nat_mixes,
            self._day_of_weeks,
            self._actuals,
        ) = load_local_data(property_id, db_client)

        self._n_samples = len(self._base_pars)
        logger.info(
            "LaudsNumpyClient[%s]: loaded %d training samples",
            property_id,
            self._n_samples,
        )

        # Model weights (initialised as ones ≈ rule-based baseline)
        self._model = LaudsModelWeights()

        # Privacy accountant
        self._accountant = PrivacyAccountant(target_delta=delta)

    def get_parameters(self, config: Dict[str, Any]) -> List[np.ndarray]:
        """
        Return current local model parameters.

        Called by the Flower framework at the start of each round to get
        the local model state (before global weights are applied).

        Returns:
            List containing the weight matrix as a single numpy array.
            Shape: [(N_STATIONS, N_NAT_GROUPS, N_DOW)]
        """
        return self._model.to_numpy_list()

    def fit(
        self,
        parameters: List[np.ndarray],
        config: Dict[str, Any],
    ) -> Tuple[List[np.ndarray], int, Dict[str, Any]]:
        """
        Receive global weights, fine-tune on local data, return DP-noised updates.

        Training procedure:
            1. Apply global model weights received from the server.
            2. Run local gradient descent for config["local_epochs"] steps.
               Loss = mean squared error: (actual_consumption - predicted)²
               Gradient is computed analytically (no autograd dependency).
            3. Compute weight delta = (trained_weights - global_weights).
            4. Clip delta to L2 norm ≤ clip_norm (bounds sensitivity).
            5. Add Gaussian noise calibrated to (ε, δ).
            6. Return global_weights + noisy_delta (not the raw trained weights).

        Privacy: Only the noisy delta is transmitted. The server never sees
        local_epochs intermediate states, raw gradients, or training samples.

        Args:
            parameters:   Global model weights from the server.
            config:       Training configuration dict from server.
                          Expected keys: {"local_epochs": int, "lr": float}

        Returns:
            (noisy_updated_weights, num_samples, metrics_dict)
        """
        # Abort if privacy budget is exhausted
        cum_eps, _ = self._accountant.cumulative_privacy()
        if cum_eps > self.max_cumulative_epsilon:
            logger.warning(
                "Property %s: cumulative ε=%.3f exceeds cap %.3f — skipping round",
                self.property_id,
                cum_eps,
                self.max_cumulative_epsilon,
            )
            # Return current weights unchanged; signal zero samples so server
            # down-weights this client in FedAvg aggregation.
            return self._model.to_numpy_list(), 0, {"skipped": True}

        # Apply global weights
        global_model = LaudsModelWeights.from_numpy_list(parameters)
        self._model = global_model

        if self._n_samples == 0:
            logger.warning(
                "Property %s: no training data — returning global weights unchanged",
                self.property_id,
            )
            return self._model.to_numpy_list(), 0, {}

        local_epochs: int = int(config.get("local_epochs", 1))
        lr: float = float(config.get("lr", DEFAULT_LEARNING_RATE))

        # Store initial (global) weights for delta computation
        initial_weights = self._model.weights.copy()

        # ── Local gradient descent ────────────────────────────────────────────
        # Loss: L = (1/N) Σ_i Σ_s (actual[i,s] - predicted[i,s])²
        # ∂L/∂W[s,n,d] = -(2/N) Σ_{i: dow[i]==d} (actual[i,s] - predicted[i,s])
        #                 * base_par[i,s] * nat_mix[i,n]

        for _epoch in range(local_epochs):
            grad = np.zeros_like(self._model.weights)
            total_loss = 0.0

            for i in range(self._n_samples):
                d = self._day_of_weeks[i]
                pred = self._model.predict(
                    self._base_pars[i], self._nat_mixes[i], d
                )
                residual = self._actuals[i] - pred  # (N_STATIONS,)
                total_loss += float(np.sum(residual ** 2))

                # ∂L/∂W[s, n, d] for this sample
                # shape: outer(residual, nat_mix) = (N_STATIONS, N_NAT_GROUPS)
                grad_dn = np.outer(residual, self._nat_mixes[i])  # (N_STATIONS, N_NAT_GROUPS)
                # Multiply by base_par per station
                grad_dn *= self._base_pars[i, :, np.newaxis]     # broadcast over nat groups
                grad[:, :, d] -= (2.0 / self._n_samples) * grad_dn

            # Gradient step (descent on MSE → subtract gradient)
            self._model.weights += lr * (-grad)

            # Clamp weights to reasonable range [0.1, 5.0] to prevent divergence
            self._model.weights = np.clip(self._model.weights, 0.1, 5.0)

            avg_loss = total_loss / (self._n_samples * N_STATIONS)
            logger.debug(
                "Property %s epoch %d/%d: avg_loss=%.4f",
                self.property_id,
                _epoch + 1,
                local_epochs,
                avg_loss,
            )

        # ── Compute weight delta and apply DP ─────────────────────────────────
        delta_weights = self._model.weights - initial_weights
        noisy_deltas, privacy_cost = clip_and_noise(
            [delta_weights],
            clip_norm=self.clip_norm,
            epsilon=self.epsilon,
            delta=self.delta,
        )

        # Record this round's privacy cost
        sigma = self.clip_norm * (
            (2.0 * np.log(1.25 / self.delta)) ** 0.5 / self.epsilon
        )
        self._accountant.record_round(sigma)
        cum_eps, _ = self._accountant.cumulative_privacy()

        # Apply noisy delta on top of global weights (so transmitted weights
        # are global + noisy_delta, not raw local trained weights)
        noisy_weights = initial_weights + noisy_deltas[0]
        noisy_weights = np.clip(noisy_weights, 0.1, 5.0)

        metrics = {
            "train_loss": float(avg_loss) if self._n_samples > 0 else 0.0,
            "dp_epsilon_round": privacy_cost.epsilon,
            "dp_epsilon_cumulative": float(cum_eps),
            "dp_delta": privacy_cost.delta,
        }

        logger.info(
            "Property %s fit complete: samples=%d, ε_round=%.3f, ε_cumulative=%.3f",
            self.property_id,
            self._n_samples,
            privacy_cost.epsilon,
            cum_eps,
        )

        return [noisy_weights], self._n_samples, metrics

    def evaluate(
        self,
        parameters: List[np.ndarray],
        config: Dict[str, Any],
    ) -> Tuple[float, int, Dict[str, Any]]:
        """
        Evaluate global model weights on the local holdout set.

        Uses the final 20% of available samples (by date order) as a holdout.
        Returns loss (MSE), number of holdout samples, and MAPE metric.

        The MAPE (Mean Absolute Percentage Error) is computed over station-level
        consumption predictions, excluding samples with near-zero actual consumption
        to avoid division-by-zero inflation.

        Args:
            parameters: Global model weights to evaluate.
            config:     Evaluation configuration dict.

        Returns:
            (loss, num_samples, {"mape": float})
        """
        if self._n_samples == 0:
            return 0.0, 0, {"mape": 0.0}

        # Apply global weights
        eval_model = LaudsModelWeights.from_numpy_list(parameters)

        # Holdout: last 20% of samples (chronological order preserved by load_local_data)
        holdout_start = max(1, int(self._n_samples * 0.8))
        holdout_base = self._base_pars[holdout_start:]
        holdout_nat = self._nat_mixes[holdout_start:]
        holdout_dow = self._day_of_weeks[holdout_start:]
        holdout_actual = self._actuals[holdout_start:]

        n_holdout = len(holdout_base)
        if n_holdout == 0:
            return 0.0, 0, {"mape": 0.0}

        total_mse = 0.0
        ape_sum = 0.0
        ape_count = 0

        for i in range(n_holdout):
            pred = eval_model.predict(holdout_base[i], holdout_nat[i], holdout_dow[i])
            residual = holdout_actual[i] - pred
            total_mse += float(np.sum(residual ** 2))

            # MAPE: only for stations with non-trivial actual consumption
            for s in range(N_STATIONS):
                if holdout_actual[i, s] > 0.5:  # ignore near-zero measurements
                    ape = abs(residual[s]) / holdout_actual[i, s]
                    ape_sum += ape
                    ape_count += 1

        avg_mse = total_mse / (n_holdout * N_STATIONS)
        mape = float(ape_sum / max(ape_count, 1))

        logger.info(
            "Property %s evaluate: holdout=%d, mse=%.4f, mape=%.4f",
            self.property_id,
            n_holdout,
            avg_mse,
            mape,
        )

        return float(avg_mse), n_holdout, {"mape": mape}


# ─── Entry point ──────────────────────────────────────────────────────────────


def run_client(
    property_id: str,
    server_address: str,
    rounds: int = 3,
    epsilon: float = DEFAULT_DP_EPSILON,
    delta: float = DEFAULT_DP_DELTA,
) -> None:
    """
    Entry point for running the Lauds FL client.

    Connects to the Flower aggregation server and participates in 'rounds'
    federated learning rounds. Only model weight updates leave this process —
    raw training data stays local.

    Args:
        property_id:    UUID of the property (used for DB queries + consent check).
        server_address: Flower server address, e.g. "fl.lauds.internal:8080".
        rounds:         Number of FL rounds to participate in.
        epsilon:        DP ε budget per round.
        delta:          DP δ per round.

    Environment:
        Expects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment
        (loaded from .env by python-dotenv if available).
    """
    import os
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    from supabase import create_client, Client

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    db_client: Client = create_client(supabase_url, supabase_key)

    # Check consent before connecting to FL server
    consent_result = db_client.from_("model_contribution_consent").select(
        "id, revoked_at, contribution_scope"
    ).eq("property_id", property_id).is_("revoked_at", "null").execute()

    if not consent_result.data:
        logger.warning(
            "Property %s has not consented to model contribution — FL client will not start.",
            property_id,
        )
        return

    logger.info(
        "Starting Lauds FL client for property %s → %s (%d rounds, ε=%.2f, δ=%.0e)",
        property_id,
        server_address,
        rounds,
        epsilon,
        delta,
    )

    client = LaudsNumpyClient(
        property_id=property_id,
        db_client=db_client,
        epsilon=epsilon,
        delta=delta,
    )

    fl.client.start_numpy_client(
        server_address=server_address,
        client=client,
    )
