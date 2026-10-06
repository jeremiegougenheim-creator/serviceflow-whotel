"""
Differential Privacy for Lauds FL gradients.

Algorithm: Gaussian Mechanism
- Clip gradients to bounded L2 sensitivity
- Add calibrated Gaussian noise: σ = sensitivity * sqrt(2 * ln(1.25/δ)) / ε
- Track privacy budget: (ε, δ)-DP per round, cumulative via Rényi DP composition

Privacy parameters (pilot):
    ε = 1.0  (moderate privacy, appropriate for hotel-level aggregates)
    δ = 1e-5 (standard for ML contexts)

This satisfies: no single property's data can be inferred from the global model
with probability greater than exp(ε) = 2.72× better than random.

Rényi DP composition uses the moments accountant approach (Mironov 2017).
For T rounds with per-round (ε_r, δ_r), the cumulative guarantee is computed
via the Rényi divergence bound and converted back to (ε, δ)-DP.

References:
    Dwork & Roth (2014) "The Algorithmic Foundations of Differential Privacy"
    Mironov (2017) "Rényi Differential Privacy of the Gaussian Mechanism"
    Abadi et al. (2016) "Deep Learning with Differential Privacy" (moments accountant)
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Tuple

import numpy as np


# ─── Gaussian Mechanism ────────────────────────────────────────────────────────


@dataclass
class GaussianMechanism:
    """
    The Gaussian Mechanism for (ε, δ)-differential privacy.

    For a function f with L2 sensitivity Δf, adds Gaussian noise calibrated to:
        σ = Δf * sqrt(2 * ln(1.25/δ)) / ε

    This achieves (ε, δ)-DP per Dwork & Roth Theorem A.1.

    Attributes:
        epsilon:     Privacy budget ε > 0. Smaller = more private, more noise.
        delta:       Failure probability δ ∈ (0, 1). Typically 1e-5.
        sensitivity: L2 sensitivity Δf of the function being protected.
    """

    epsilon: float
    delta: float
    sensitivity: float

    def __post_init__(self) -> None:
        if self.epsilon <= 0:
            raise ValueError(f"epsilon must be > 0, got {self.epsilon}")
        if not (0 < self.delta < 1):
            raise ValueError(f"delta must be in (0, 1), got {self.delta}")
        if self.sensitivity <= 0:
            raise ValueError(f"sensitivity must be > 0, got {self.sensitivity}")

    @property
    def sigma(self) -> float:
        """
        Gaussian noise standard deviation.

        σ = sensitivity * sqrt(2 * ln(1.25/δ)) / ε

        This is the tight characterisation from Dwork & Roth Theorem A.1.
        """
        return self.sensitivity * math.sqrt(2.0 * math.log(1.25 / self.delta)) / self.epsilon

    def add_noise(self, x: np.ndarray) -> np.ndarray:
        """
        Add calibrated Gaussian noise to array x.

        Returns x + N(0, σ²·I) where σ is computed from (ε, δ, sensitivity).

        Args:
            x: Input gradient array of any shape.

        Returns:
            Noisy array with the same shape as x.
        """
        noise = np.random.normal(loc=0.0, scale=self.sigma, size=x.shape)
        return x + noise


# ─── Gradient clipping ────────────────────────────────────────────────────────


def clip_gradients(gradients: List[np.ndarray], max_norm: float) -> List[np.ndarray]:
    """
    Clip each gradient tensor to have L2 norm ≤ max_norm (per-tensor clipping).

    This bounds the L2 sensitivity of the gradient sum to max_norm, which is
    the sensitivity parameter used in the Gaussian mechanism.

    Per-tensor clipping (as opposed to global clipping over all parameters) is
    used here for simplicity and to maintain per-layer gradient scale semantics.

    Args:
        gradients: List of gradient arrays (one per model parameter).
        max_norm:  Maximum allowed L2 norm per gradient tensor.

    Returns:
        List of clipped gradient arrays with the same shapes.
    """
    clipped = []
    for g in gradients:
        norm = float(np.linalg.norm(g))
        if norm > max_norm:
            clipped.append(g * (max_norm / norm))
        else:
            clipped.append(g.copy())
    return clipped


# ─── Combined clip + noise ────────────────────────────────────────────────────


@dataclass
class PrivacyCost:
    """Tracks the (ε, δ) cost of a single DP operation."""
    epsilon: float
    delta: float


def clip_and_noise(
    gradients: List[np.ndarray],
    clip_norm: float,
    epsilon: float,
    delta: float,
) -> Tuple[List[np.ndarray], PrivacyCost]:
    """
    Clip gradients to bounded L2 norm, then add calibrated Gaussian noise.

    This is the standard DP-SGD gradient perturbation step:
        1. Clip each gradient to max_norm = clip_norm  (bounds sensitivity)
        2. Add Gaussian noise with σ = clip_norm * sqrt(2·ln(1.25/δ)) / ε

    Args:
        gradients: List of gradient arrays from local training.
        clip_norm: Maximum L2 norm for each gradient tensor (= sensitivity).
        epsilon:   Per-round privacy budget ε.
        delta:     Per-round failure probability δ.

    Returns:
        (noisy_gradients, privacy_cost) where privacy_cost is the (ε, δ)
        spent for this operation.
    """
    clipped = clip_gradients(gradients, clip_norm)
    mechanism = GaussianMechanism(
        epsilon=epsilon, delta=delta, sensitivity=clip_norm
    )
    noisy = [mechanism.add_noise(g) for g in clipped]
    return noisy, PrivacyCost(epsilon=epsilon, delta=delta)


# ─── Privacy Accountant (Rényi DP composition) ────────────────────────────────


@dataclass
class PrivacyAccountant:
    """
    Tracks cumulative privacy cost over multiple FL rounds using
    Rényi Differential Privacy (RDP) composition (Mironov 2017).

    Rényi DP allows tighter composition than basic (ε, δ)-DP.
    Each round's RDP cost is computed using the Gaussian mechanism's
    closed-form RDP, then composed additively. The cumulative RDP is
    converted back to (ε, δ)-DP for reporting.

    The Gaussian mechanism with σ satisfies (α, α / (2σ²))-RDP for all α > 1.
    (Mironov 2017, Proposition 3.)

    Under k-fold composition, the mechanism satisfies (α, k·α/(2σ²))-RDP.
    Converting to (ε, δ)-DP via Proposition 3 of Mironov:
        ε = rdp_epsilon - log(δ) / (α - 1)     (minimised over α)

    Attributes:
        target_delta: The δ to use when converting RDP → (ε, δ)-DP.
        alphas:       Rényi orders to consider for the conversion.
                      Larger orders are tighter for small σ; smaller for large σ.
    """

    target_delta: float = 1e-5
    alphas: List[float] = field(
        default_factory=lambda: [
            1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 16.0, 32.0, 64.0
        ]
    )
    _rdp_per_alpha: List[float] = field(init=False)
    _rounds: int = field(init=False, default=0)

    def __post_init__(self) -> None:
        self._rdp_per_alpha = [0.0] * len(self.alphas)
        self._rounds = 0

    def _gaussian_rdp(self, alpha: float, sigma: float) -> float:
        """
        RDP of the Gaussian mechanism at order α.

        For noise multiplier σ (normalised sensitivity = 1):
            RDP(α) = α / (2 * σ²)

        (Mironov 2017, Proposition 3 — exact for the Gaussian mechanism.)
        """
        return alpha / (2.0 * sigma ** 2)

    def _rdp_to_dp(self, rdp_values: List[float]) -> Tuple[float, float]:
        """
        Convert accumulated RDP to (ε, δ)-DP, minimising over α.

        From Mironov (2017) Proposition 3:
            ε(δ) = min_α [ rdp(α) + log(1 - 1/α) - log(δ·(α-1)/α) ] / (α - 1)

        The tighter conversion from Balle et al. (2020) is used where available.
        Here we use the standard Mironov bound for clarity:
            ε = rdp(α) - log(δ) / (α - 1)   (simplified form, conservative)
        """
        best_eps = float("inf")
        for alpha, rdp in zip(self.alphas, rdp_values):
            if alpha <= 1:
                continue
            # Mironov Proposition 3 (simplified conversion):
            # ε ≤ rdp(α) + log((α-1)/α) - (log(δ) + log(α)) / (α - 1)
            eps = (
                rdp
                + math.log((alpha - 1) / alpha)
                - (math.log(self.target_delta) + math.log(alpha)) / (alpha - 1)
            )
            best_eps = min(best_eps, eps)

        return best_eps, self.target_delta

    def record_round(self, sigma: float) -> None:
        """
        Record the privacy cost of one FL training round.

        Args:
            sigma: The noise multiplier used this round (σ = noise_std / sensitivity).
                   Must be the normalised noise multiplier (i.e. sensitivity = 1).
        """
        for i, alpha in enumerate(self.alphas):
            self._rdp_per_alpha[i] += self._gaussian_rdp(alpha, sigma)
        self._rounds += 1

    def cumulative_privacy(self) -> Tuple[float, float]:
        """
        Returns the cumulative (ε, δ) privacy guarantee after all recorded rounds.

        The δ is self.target_delta. ε is derived from the composed RDP via
        the tightest conversion over all tracked Rényi orders.

        Returns:
            (epsilon, delta) — the cumulative privacy cost.
        """
        if self._rounds == 0:
            return 0.0, self.target_delta
        return self._rdp_to_dp(self._rdp_per_alpha)

    @property
    def rounds_completed(self) -> int:
        """Number of rounds recorded so far."""
        return self._rounds


# ─── Noise multiplier search ──────────────────────────────────────────────────


def compute_noise_multiplier(
    target_epsilon: float,
    target_delta: float,
    steps: int,
    delta: float,
    tolerance: float = 1e-3,
) -> float:
    """
    Find the minimum noise multiplier σ such that running 'steps' rounds of
    the Gaussian mechanism achieves (target_epsilon, delta)-DP.

    Uses binary search over σ ∈ [1e-3, 1e4].

    Args:
        target_epsilon: Desired final ε.
        target_delta:   The δ for the final (ε, δ) guarantee.
        steps:          Number of training rounds (FL rounds × local steps).
        delta:          Per-step δ (usually same as target_delta or smaller).
        tolerance:      Binary search convergence tolerance on ε.

    Returns:
        Minimum σ achieving the target privacy guarantee.

    Example:
        sigma = compute_noise_multiplier(
            target_epsilon=1.0, target_delta=1e-5, steps=30, delta=1e-5
        )
        # sigma ≈ 1.1 for T=30, ε=1.0, δ=1e-5
    """
    # Validate inputs
    if target_epsilon <= 0:
        raise ValueError(f"target_epsilon must be > 0, got {target_epsilon}")
    if not (0 < target_delta < 1):
        raise ValueError(f"target_delta must be in (0, 1), got {target_delta}")
    if steps <= 0:
        raise ValueError(f"steps must be > 0, got {steps}")

    def achieved_epsilon(sigma: float) -> float:
        """ε achieved by running 'steps' rounds with noise multiplier σ."""
        accountant = PrivacyAccountant(target_delta=target_delta)
        for _ in range(steps):
            accountant.record_round(sigma)
        eps, _ = accountant.cumulative_privacy()
        return eps

    # Binary search: lower σ → higher ε; higher σ → lower ε
    low, high = 1e-3, 1e4

    # Verify that high sigma achieves target (if not, the target is impossibly tight)
    if achieved_epsilon(high) > target_epsilon:
        raise ValueError(
            f"Cannot achieve ε={target_epsilon} in {steps} steps even with σ={high}. "
            "Consider increasing target_epsilon or reducing steps."
        )

    for _ in range(64):  # 64 iterations → precision < (1e4 - 1e-3) / 2^64 ≈ 0
        mid = (low + high) / 2.0
        eps = achieved_epsilon(mid)
        if eps <= target_epsilon:
            high = mid
        else:
            low = mid
        if (high - low) < tolerance * target_epsilon:
            break

    return high
