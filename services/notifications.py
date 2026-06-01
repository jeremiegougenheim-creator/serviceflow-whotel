"""
services/notifications.py — Role-based notification routing (CLAUDE.md §17)

Routes events to the right team members based on:
  1. Their role (GM / F&B Manager / Chef / Sous-chef / Prep cook / Auditor)
  2. Their confirmed daily_assignment for the service date
  3. Station scope — station-specific events only reach members assigned to that station

RÈGLE 4: No action is triggered automatically — notifications prompt, humans approve.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date
from typing import Any
from uuid import UUID

# ─── Channel stubs (replace with real integrations) ───────────────────────────

def send_whatsapp(phone: str, text: str) -> None:
    """Send a WhatsApp message via configured provider (e.g. Twilio / 360dialog)."""
    # TODO: integrate via env-var-configured provider
    pass


def send_push(user_id: str, title: str, body: str) -> None:
    """Send a push notification via Supabase Edge Function `send-push`."""
    # TODO: call Supabase Edge Function with service_role key
    pass


def send_email(email: str, subject: str, body: str) -> None:
    """Send transactional email via configured provider (e.g. Resend / SendGrid)."""
    # TODO: integrate via env-var-configured provider
    pass


# ─── Types ────────────────────────────────────────────────────────────────────

@dataclass
class TeamMember:
    id: str
    property_id: str
    name: str
    role: str          # 'chef'|'sous_chef'|'prep_cook'|'fnb_mgr'|'gm'|'auditor'
    phone: str | None
    email: str | None
    active: bool = True


@dataclass
class Assignment:
    id: str
    outlet_id: str
    service_date: date
    team_member_id: str
    station_id: str | None
    wave: str | None
    confirmed_at: Any   # datetime | None
    acknowledged_at: Any


@dataclass
class NotificationResult:
    sent: list[dict] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)


# ─── NOTIFICATION_RULES ───────────────────────────────────────────────────────
# Derived from the routing matrix in CLAUDE.md §17.
# Each rule defines:
#   recipients   — roles that receive this event
#   channels     — dict[role → list[channel]]  ('whatsapp'|'push'|'email')
#   template     — template key used by build_payload()

NOTIFICATION_RULES: dict[str, dict] = {
    "brief_j_minus_1": {
        "recipients": {"gm", "fnb_mgr", "chef"},
        "channels": {
            "gm":      ["whatsapp"],
            "fnb_mgr": ["email", "push"],
            "chef":    ["push"],
        },
        "template": "brief_j_minus_1",
    },
    "check_in_05_30": {
        "recipients": {"chef", "sous_chef", "prep_cook"},
        "channels": {
            "chef":      ["push"],
            "sous_chef": ["push"],
            "prep_cook": ["push"],
        },
        "template": "check_in",
    },
    "pre_service_05_45": {
        "recipients": {"fnb_mgr", "chef", "sous_chef", "prep_cook"},
        "channels": {
            "fnb_mgr":   ["push"],
            "chef":      ["push"],
            "sous_chef": ["push"],
            "prep_cook": ["push"],
        },
        "template": "pre_service",
    },
    "pace_alert": {
        "recipients": {"chef", "sous_chef"},
        "channels": {
            "chef":      ["push"],
            "sous_chef": ["push"],
        },
        "template": "pace_alert",
        "station_scoped": True,
    },
    "running_low": {
        "recipients": {"chef", "sous_chef", "prep_cook"},
        "channels": {
            "chef":      ["push"],
            "sous_chef": ["push"],
            "prep_cook": ["push"],
        },
        "template": "running_low",
        "station_scoped": True,
    },
    "waste_prevention": {
        "recipients": {"fnb_mgr", "chef", "sous_chef"},
        "channels": {
            "fnb_mgr": ["push"],
            "chef":    ["push"],
            "sous_chef": ["push"],
        },
        "template": "waste_prevention",
        "station_scoped": True,
    },
    "group_arrival": {
        "recipients": {"fnb_mgr", "chef", "sous_chef"},
        "channels": {
            "fnb_mgr": ["push"],
            "chef":    ["push"],
            "sous_chef": ["push"],
        },
        "template": "group_arrival",
        "station_scoped": True,
    },
    "service_close": {
        "recipients": {"chef", "sous_chef"},
        "channels": {
            "chef":      ["push"],
            "sous_chef": ["push"],
        },
        "template": "service_close",
    },
    "debrief_12_30": {
        "recipients": {"gm", "fnb_mgr", "chef", "sous_chef"},
        "channels": {
            "gm":      ["push"],
            "fnb_mgr": ["push"],
            "chef":    ["push"],
            "sous_chef": ["push"],
        },
        "template": "debrief",
    },
    "flag_raised": {
        "recipients": {"chef"},
        "channels": {
            "chef": ["push"],
        },
        "template": "flag_raised",
    },
}


# ─── Payload builder ──────────────────────────────────────────────────────────

def build_payload(template: str, payload: dict, role: str) -> dict:
    """Build a role-appropriate message from a template + payload."""
    station_name = payload.get("station_name", "")
    outlet_name  = payload.get("outlet_name", "")
    date_str     = str(payload.get("service_date", ""))

    templates: dict[str, dict[str, dict]] = {
        "brief_j_minus_1": {
            "gm":      {"title": f"Lauds — J-1 brief {date_str}", "body": f"{outlet_name}: brief prêt."},
            "fnb_mgr": {"title": f"Lauds — Brief complet {date_str}", "body": f"{outlet_name}: brief + ajustements disponibles."},
            "chef":    {"title": f"Lauds — Brief cuisine {date_str}", "body": f"{outlet_name}: prévisions et stations disponibles."},
        },
        "check_in": {
            "chef":      {"title": "Lauds — 05:30 check-in", "body": "Confirmez le roster du jour."},
            "sous_chef": {"title": "Lauds — 05:30 check-in", "body": "Accusez réception de votre assignation."},
            "prep_cook": {"title": "Lauds — 05:30 check-in", "body": "Accusez réception de votre liste."},
        },
        "pre_service_05_45": {
            "fnb_mgr":   {"title": "Lauds — Pré-service", "body": f"{outlet_name}: brief complet disponible."},
            "chef":      {"title": "Lauds — Pré-service", "body": f"{outlet_name}: toutes les stations."},
            "sous_chef": {"title": "Lauds — Vos pars", "body": f"Station {station_name}: pars du jour."},
            "prep_cook": {"title": "Lauds — Votre liste", "body": f"Station {station_name}: liste de préparation."},
        },
        "pace_alert": {
            "chef":      {"title": "Lauds — Alerte pace", "body": f"Station {station_name}: écart pace détecté."},
            "sous_chef": {"title": "Lauds — Alerte pace", "body": f"Station {station_name}: vérifiez votre pace."},
        },
        "running_low": {
            "chef":      {"title": "Lauds — Stock bas", "body": f"Station {station_name}: niveau bas — approuvez réassort."},
            "sous_chef": {"title": "Lauds — Stock bas urgent", "body": f"Station {station_name}: stock bas."},
            "prep_cook": {"title": "Lauds — Action requise", "body": f"Station {station_name}: réapprovisionner."},
        },
        "waste_prevention": {
            "fnb_mgr": {"title": "Lauds — Prévention gaspillage", "body": f"Station {station_name}: alerte gaspillage."},
            "chef":    {"title": "Lauds — Prévention gaspillage", "body": f"Station {station_name}: action requise — approuvez."},
            "sous_chef": {"title": "Lauds — Gaspillage", "body": f"Station {station_name}: réduire la production."},
        },
        "group_arrival": {
            "fnb_mgr": {"title": "Lauds — Arrivée groupe", "body": payload.get("detail", "Groupe en arrivée.")},
            "chef":    {"title": "Lauds — Arrivée groupe", "body": f"{payload.get('detail', '')} — approuvez ajustement."},
            "sous_chef": {"title": "Lauds — Arrivée groupe", "body": f"Station {station_name}: ajustement requis."},
        },
        "service_close": {
            "chef":      {"title": "Lauds — Clôture service", "body": f"{outlet_name}: confirmez la clôture."},
            "sous_chef": {"title": "Lauds — Clôture service", "body": f"Station {station_name}: saisissez le gaspillage (kg)."},
        },
        "debrief": {
            "gm":      {"title": "Lauds — Débrief NT$/ESG", "body": f"{outlet_name}: résultats du jour."},
            "fnb_mgr": {"title": "Lauds — Débrief complet", "body": f"{outlet_name}: rapport complet."},
            "chef":    {"title": "Lauds — Apprentissage", "body": f"{outlet_name}: débrief cuisine."},
            "sous_chef": {"title": "Lauds — Votre station", "body": f"Station {station_name}: débrief."},
        },
        "flag_raised": {
            "chef": {
                "title": "Lauds — Signalement",
                "body": f"Station {station_name}: {payload.get('kind', 'issue')} signalé par {payload.get('raised_by_name', 'équipe')}."},
        },
    }

    role_map = templates.get(template, {})
    return role_map.get(role, {"title": "Lauds", "body": ""})


# ─── Core routing function ────────────────────────────────────────────────────

def notify(
    event_kind: str,
    payload: dict,
    service_date: date,
    outlet_id: str,
    *,
    assignments: list[Assignment],
    members: dict[str, TeamMember],
) -> NotificationResult:
    """
    Route a notification to the right team members.

    Parameters
    ----------
    event_kind   : key in NOTIFICATION_RULES
    payload      : event-specific data (station_id, station_name, detail, …)
    service_date : the breakfast service date
    outlet_id    : outlet scope
    assignments  : daily_assignments rows for (outlet_id, service_date)
                   — only confirmed rows (confirmed_at IS NOT NULL) should be passed
    members      : dict[team_member_id → TeamMember]

    Returns
    -------
    NotificationResult with sent / skipped lists (for testing + audit)
    """
    if event_kind not in NOTIFICATION_RULES:
        raise ValueError(f"Unknown event_kind: {event_kind!r}")

    rules          = NOTIFICATION_RULES[event_kind]
    recipients     = rules["recipients"]
    channels_by_role = rules["channels"]
    template       = rules["template"]
    station_scoped = rules.get("station_scoped", False)
    event_station  = payload.get("station_id")

    result = NotificationResult()

    for assignment in assignments:
        member = members.get(assignment.team_member_id)
        if member is None or not member.active:
            result.skipped.append({"reason": "member_not_found_or_inactive",
                                   "team_member_id": assignment.team_member_id})
            continue

        if member.role not in recipients:
            result.skipped.append({"reason": "role_not_in_recipients",
                                   "team_member_id": member.id, "role": member.role})
            continue

        # Station-specific events only reach members assigned to that station
        if station_scoped and event_station:
            if assignment.station_id != event_station:
                result.skipped.append({"reason": "station_mismatch",
                                       "team_member_id": member.id,
                                       "member_station": assignment.station_id,
                                       "event_station": event_station})
                continue

        message  = build_payload(template, {**payload, "service_date": service_date}, member.role)
        channels = channels_by_role.get(member.role, [])

        for channel in channels:
            if channel == "whatsapp" and member.phone:
                send_whatsapp(member.phone, f"{message['title']}\n{message['body']}")
            elif channel == "push":
                send_push(member.id, message["title"], message["body"])
            elif channel == "email" and member.email:
                send_email(member.email, message["title"], message["body"])

            result.sent.append({
                "team_member_id": member.id,
                "role":    member.role,
                "channel": channel,
                "event":   event_kind,
                "message": message,
            })

    return result
