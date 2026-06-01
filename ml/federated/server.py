"""
Lauds FL Aggregation Server

Runs centrally on Lauds infrastructure — NOT on client properties.
Aggregates model UPDATES only — no raw data from properties is ever received.
Uses FedAvg (weighted by num_samples) for aggregation.

Security model:
    - Clients send DP-noised weight updates only.
    - The server never receives raw consumption data, guest counts,
      waste measurements, or any property-identifying information beyond
      the Flower client ID (which maps to a property UUID maintained internally).
    - Round history is stored as aggregated metrics (MAPE distribution,
      num_clients, avg_loss) — not the individual client updates.

Server orchestrates:
    1. configure_fit()   → push config to clients (local_epochs, lr)
    2. aggregate_fit()   → FedAvg over DP-noised client updates
    3. evaluate()        → aggregate MAPE across clients for global benchmark
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import flwr as fl
import numpy as np
from flwr.common import (
    EvaluateIns,
    EvaluateRes,
    FitIns,
    FitRes,
    MetricsAggregationFn,
    NDArrays,
    Parameters,
    Scalar,
    ndarrays_to_parameters,
    parameters_to_ndarrays,
)
from flwr.server.client_manager import ClientManager
from flwr.server.client_proxy import ClientProxy
from flwr.server.strategy import FedAvg

from .client import N_STATIONS, N_NAT_GROUPS, N_DOW, LaudsModelWeights

logger = logging.getLogger(__name__)

# ─── Round history path ───────────────────────────────────────────────────────

ROUND_LOG_PATH = Path(os.environ.get("FL_ROUND_LOG", "fl_round_history.json"))


def _append_round_log(entry: Dict[str, Any]) -> None:
    """
    Append a round summary to the JSON round history log.

    The log contains only aggregated metrics per round:
        round, timestamp, num_clients, avg_loss, mape_distribution,
        aggregated_weights_norm
    Raw client updates or individual property data are NEVER written here.
    """
    history: List[Dict[str, Any]] = []
    if ROUND_LOG_PATH.exists():
        try:
            with ROUND_LOG_PATH.open("r") as f:
                history = json.load(f)
        except (json.JSONDecodeError, OSError):
            history = []

    history.append(entry)

    with ROUND_LOG_PATH.open("w") as f:
        json.dump(history, f, indent=2, default=str)


# ─── Metrics aggregation helpers ─────────────────────────────────────────────


def weighted_average_mape(metrics: List[Tuple[int, Dict[str, Scalar]]]) -> Dict[str, Scalar]:
    """
    Aggregate MAPE across clients using sample-weighted average.

    Args:
        metrics: List of (num_samples, metrics_dict) from each client.

    Returns:
        {"mape": float} — weighted average MAPE.
    """
    total_samples = sum(n for n, _ in metrics)
    if total_samples == 0:
        return {"mape": 0.0}

    weighted_mape = sum(
        n * float(m.get("mape", 0.0)) for n, m in metrics
    ) / total_samples

    mape_values = [float(m.get("mape", 0.0)) for _, m in metrics]
    return {
        "mape": weighted_mape,
        "mape_min": float(min(mape_values)) if mape_values else 0.0,
        "mape_max": float(max(mape_values)) if mape_values else 0.0,
        "mape_std": float(np.std(mape_values)) if len(mape_values) > 1 else 0.0,
        "num_clients": float(len(metrics)),
    }


def aggregate_fit_metrics(metrics: List[Tuple[int, Dict[str, Scalar]]]) -> Dict[str, Scalar]:
    """
    Aggregate training metrics across clients after a fit round.

    Args:
        metrics: List of (num_samples, metrics_dict) from each client.

    Returns:
        Aggregated metrics dict with weighted averages and DP budget summary.
    """
    total_samples = sum(n for n, _ in metrics)
    if total_samples == 0:
        return {}

    weighted_loss = sum(
        n * float(m.get("train_loss", 0.0)) for n, m in metrics
        if n > 0
    ) / max(total_samples, 1)

    epsilon_values = [float(m.get("dp_epsilon_cumulative", 0.0)) for _, m in metrics]
    skipped = sum(1 for _, m in metrics if m.get("skipped", False))

    return {
        "train_loss": weighted_loss,
        "dp_epsilon_cumulative_max": float(max(epsilon_values)) if epsilon_values else 0.0,
        "dp_epsilon_cumulative_avg": float(np.mean(epsilon_values)) if epsilon_values else 0.0,
        "num_clients": float(len(metrics)),
        "skipped_clients": float(skipped),
        "total_samples": float(total_samples),
    }


# ─── Lauds FL Strategy ────────────────────────────────────────────────────────


class LaudsStrategy(FedAvg):
    """
    Federated Averaging strategy customized for the Lauds forecasting model.

    Extends FedAvg with:
    - Adaptive local_epochs: 1 epoch in early rounds (unstable), more later
    - Per-round aggregation logging (metrics only, no client data)
    - Global MAPE tracking for benchmark reporting
    - Minimum client count enforcement
    - Graceful handling of clients that skip due to exhausted DP budget

    Args:
        num_rounds:     Total number of FL rounds planned (used for epoch schedule).
        min_clients:    Minimum number of clients required per round.
        initial_lr:     Starting learning rate for client training.
        lr_decay:       Multiplicative LR decay applied each round.
    """

    def __init__(
        self,
        num_rounds: int = 10,
        min_clients: int = 3,
        initial_lr: float = 0.01,
        lr_decay: float = 0.95,
        **kwargs: Any,
    ) -> None:
        self.num_rounds = num_rounds
        self._initial_lr = initial_lr
        self._lr_decay = lr_decay
        self._current_round = 0
        self._round_summaries: List[Dict[str, Any]] = []

        super().__init__(
            min_fit_clients=min_clients,
            min_evaluate_clients=min_clients,
            min_available_clients=min_clients,
            fit_metrics_aggregation_fn=aggregate_fit_metrics,
            evaluate_metrics_aggregation_fn=weighted_average_mape,
            **kwargs,
        )

    def _local_epochs_for_round(self, server_round: int) -> int:
        """
        Adaptive epoch schedule:
            Rounds 1–2:  1 epoch  (unstable global model, avoid overfitting)
            Rounds 3–6:  2 epochs (model stabilising)
            Rounds 7+:   3 epochs (fine-tuning phase)
        """
        if server_round <= 2:
            return 1
        elif server_round <= 6:
            return 2
        else:
            return 3

    def _lr_for_round(self, server_round: int) -> float:
        """Exponentially decayed learning rate."""
        return self._initial_lr * (self._lr_decay ** (server_round - 1))

    def configure_fit(
        self,
        server_round: int,
        parameters: Parameters,
        client_manager: ClientManager,
    ) -> List[Tuple[ClientProxy, FitIns]]:
        """
        Configure each client's training for this round.

        Pushes per-round hyperparameters (local_epochs, lr) to clients.
        The server controls the training pace — clients cannot request more
        training than the server permits.
        """
        self._current_round = server_round
        config = {
            "local_epochs": self._local_epochs_for_round(server_round),
            "lr": self._lr_for_round(server_round),
            "server_round": server_round,
        }

        logger.info(
            "Round %d config: local_epochs=%d, lr=%.5f",
            server_round,
            config["local_epochs"],
            config["lr"],
        )

        fit_ins = FitIns(parameters, config)
        clients = client_manager.sample(
            num_clients=self.min_fit_clients,
            min_num_clients=self.min_fit_clients,
        )
        return [(client, fit_ins) for client in clients]

    def aggregate_fit(
        self,
        server_round: int,
        results: List[Tuple[ClientProxy, FitRes]],
        failures: List[Union[Tuple[ClientProxy, FitRes], BaseException]],
    ) -> Tuple[Optional[Parameters], Dict[str, Scalar]]:
        """
        Aggregate DP-noised weight updates from clients using FedAvg.

        Logs per-round aggregation statistics (no raw client data).
        Filters out clients that returned zero samples (DP budget exhausted).

        FedAvg: w_global = Σ_i (n_i / N) * w_i
                where n_i = num_samples from client i, N = total samples.
        """
        if failures:
            logger.warning(
                "Round %d: %d client(s) failed or timed out", server_round, len(failures)
            )

        # Filter out skipped clients (zero samples = budget exhausted)
        active_results = [
            (client, fit_res)
            for client, fit_res in results
            if fit_res.num_examples > 0
        ]

        if not active_results:
            logger.error(
                "Round %d: no active clients returned results — skipping aggregation",
                server_round,
            )
            return None, {}

        # Delegate aggregation to parent FedAvg
        aggregated_params, metrics = super().aggregate_fit(
            server_round, active_results, failures
        )

        # Log round summary (aggregated metrics only, no raw weights)
        if aggregated_params is not None:
            agg_weights = parameters_to_ndarrays(aggregated_params)
            weights_norm = float(np.linalg.norm(agg_weights[0])) if agg_weights else 0.0
        else:
            weights_norm = 0.0

        summary = {
            "round": server_round,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "num_clients_active": len(active_results),
            "num_clients_total": len(results),
            "num_failures": len(failures),
            "aggregated_weights_norm": weights_norm,
            "metrics": {k: float(v) for k, v in metrics.items()},
        }
        self._round_summaries.append(summary)
        _append_round_log(summary)

        logger.info(
            "Round %d aggregated: %d/%d clients, weights_norm=%.4f, "
            "train_loss=%.4f, ε_max=%.3f",
            server_round,
            len(active_results),
            len(results),
            weights_norm,
            float(metrics.get("train_loss", 0.0)),
            float(metrics.get("dp_epsilon_cumulative_max", 0.0)),
        )

        return aggregated_params, metrics

    def evaluate(
        self,
        server_round: int,
        parameters: Parameters,
    ) -> Optional[Tuple[float, Dict[str, Scalar]]]:
        """
        Optional server-side evaluation of the global model.

        Computes a global benchmark loss using the aggregated weights.
        In production this would evaluate on a held-out Lauds benchmark dataset.
        Here we compute the Frobenius norm deviation from the rule-based prior
        (a proxy for how much the global model has diverged from the baseline).
        """
        ndarrays = parameters_to_ndarrays(parameters)
        if not ndarrays:
            return None

        weights = ndarrays[0]
        # Prior: all-ones matrix (rule-based baseline)
        prior = np.ones_like(weights)
        deviation = float(np.linalg.norm(weights - prior, "fro"))

        metrics = {
            "global_deviation_from_prior": deviation,
            "weights_mean": float(np.mean(weights)),
            "weights_std": float(np.std(weights)),
            "server_round": float(server_round),
        }

        logger.info(
            "Round %d server evaluate: deviation_from_prior=%.4f, "
            "weights_mean=%.4f±%.4f",
            server_round,
            deviation,
            metrics["weights_mean"],
            metrics["weights_std"],
        )

        return deviation, metrics

    def get_round_history(self) -> List[Dict[str, Any]]:
        """
        Return the in-memory round history (aggregated metrics per round).
        Contains no raw client data or individual property information.
        """
        return list(self._round_summaries)


# ─── Entry point ──────────────────────────────────────────────────────────────


def run_server(
    num_rounds: int = 10,
    min_clients: int = 3,
    server_address: str = "0.0.0.0:8080",
    initial_weights: Optional[NDArrays] = None,
) -> None:
    """
    Start the Lauds Flower aggregation server.

    The server aggregates model updates only — no raw property data is ever
    received or stored. Round history (aggregated metrics) is written to
    FL_ROUND_LOG (default: fl_round_history.json).

    Args:
        num_rounds:      Number of FL rounds to run.
        min_clients:     Minimum clients required per round.
        server_address:  Address to listen on (host:port).
        initial_weights: Optional starting model weights. If None, the server
                         starts from an all-ones (rule-based prior) weight matrix.
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    # Initialise global model from rule-based prior if not provided
    if initial_weights is None:
        init_model = LaudsModelWeights()
        init_model.weights = np.ones((N_STATIONS, N_NAT_GROUPS, N_DOW))
        initial_weights = init_model.to_numpy_list()

    initial_parameters = ndarrays_to_parameters(initial_weights)

    strategy = LaudsStrategy(
        num_rounds=num_rounds,
        min_clients=min_clients,
        initial_parameters=initial_parameters,
    )

    logger.info(
        "Starting Lauds FL server: rounds=%d, min_clients=%d, address=%s",
        num_rounds,
        min_clients,
        server_address,
    )

    fl.server.start_server(
        server_address=server_address,
        config=fl.server.ServerConfig(num_rounds=num_rounds),
        strategy=strategy,
    )

    logger.info(
        "FL training complete. Round history written to %s", ROUND_LOG_PATH
    )
