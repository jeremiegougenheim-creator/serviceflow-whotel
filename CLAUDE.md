# CLAUDE.md — Lauds · SparkEdge Digital

> Ce fichier est lu automatiquement par Claude Code au démarrage. Il contient tout ce qu'il faut savoir pour travailler sur ce projet sans briefing supplémentaire.

---

## 0. Contexte produit (à lire en premier)

**Lauds** est la **couche de décision pour le F&B hôtelier** : elle lit le profil des guests ce soir (PMS/OPERA), la météo, les événements et le gaspillage mesuré (Winnow), puis prescrit chaque matin combien préparer par station de buffet, parle au chef en service, et transforme chaque décision en économie cash + donnée ESG auditable.

Slogan : *"Orders, at dawn."*
Positionnement : *"Inside-out, not outside-in."* — les outils restaurant partent des recettes d'hier ; Lauds part du profil guest de ce soir.

**Premier client :** W Taipei (Marriott), The Kitchen Table, 405 clés, 9 stations.
**Champion :** Bastien Giannetti, GM W Taipei + Area GM Marriott Taïwan.
**Fondateur :** Jérémie Gougenheim — jeremie@sparkedge.ai · +852 69597595

---

## 1. Règles critiques (ne jamais violer)

```
RÈGLE 1 — NE PAS CASSER L'URL
  Le repo s'appelle "serviceflow-whotel" et c'est intentionnel.
  Ne JAMAIS renommer le repo, les chemins de fichiers, ou l'URL GitHub Pages.
  Rebrander UNIQUEMENT le contenu/texte affiché en "Lauds".

RÈGLE 2 — INTÉGRITÉ DE FACTURATION
  Lauds ne facture/revendique QUE les 3 points prédictifs de réduction
  que Winnow ne peut pas prévenir (surproduction évitée).
  JAMAIS les 4 points totaux.
  saving_lauds ≠ saving_total. Toujours stocker les deux séparément.

RÈGLE 3 — ESG = MESURÉ, PAS MODÉLISÉ
  Le CO₂e évité vient du waste_measured (bac Winnow ou saisie manuelle).
  Ne jamais calculer l'ESG depuis le modèle de prévision seul.
  La phrase : "Measured by the bin — not modelled."

RÈGLE 4 — HUMAN-IN-THE-LOOP
  Les auto-actions (réassort, hold) nécessitent une approbation chef.
  Ne jamais déclencher d'action automatique sans approbation.

RÈGLE 5 — BACKTEST BLOQUANT
  Aucun modèle ML ne passe en prod sans backtest validé sur données historiques.

RÈGLE 6 — PROPRIÉTÉ DES DONNÉES
  Les données restent au client. RLS strict dans Supabase.
  PII minimale (agrégats segment/nationalité, pas d'identité guest individuelle).
```

---

## 2. Rebrand (si pas encore fait)

```bash
# Remplacer dans tout le contenu/texte affiché :
# "Aubette" → "Lauds"
# "ServiceFlow" → "Lauds"  (sauf dans les noms de fichiers/repo/URL)

# Vérifier qu'aucun résidu ne reste dans le rendu :
grep -ri "aubette\|serviceflow" src/ public/ --include="*.tsx" --include="*.ts" --include="*.html" --include="*.css"

# Tagline partout : "Orders, at dawn."
# Étymologie : "Lauds — the first office of the day, sung at first light — the original morning briefing."
# URL de marque affichée : lauds.ai/wtaipei
# Contact : jeremie@sparkedge.ai · +852 69597595
```

---

## 3. Stack technique

```
Frontend  : Next.js 14+ (App Router) + TypeScript + Tailwind CSS
            PWA (manifest.json + service worker) — aucune app native
Backend   : Supabase (Postgres + Auth + Realtime + Storage + Edge Functions)
            ⚠️ Supabase est déjà connecté — utiliser le client existant
Prévision : Python 3.11+ (FastAPI ou Edge Function Supabase)
            LightGBM, scikit-learn, scipy (newsvendor)
Tests     : Vitest/Jest (unit) · Playwright (E2E) · pytest (Python)
CI        : lint + tests au push (GitHub Actions)
Realtime  : Supabase Realtime (sync cockpit live)
Voix      : STT Whisper + TTS + agent temps réel (Phase Pro)
```

---

## 4. Schéma base de données (Supabase / Postgres)

```sql
-- Multi-tenant
orgs        (id, name, created_at)
properties  (id, org_id, name, keys_count, timezone)
outlets     (id, property_id, name, type)
stations    (id, outlet_id, name, food_category, profile_priors jsonb)
users       (id, org_id, email, role)   -- role: gm|chef|sous_chef|fnb_mgr|auditor|admin
memberships (user_id, property_id, role)  -- RLS par propriété

-- Signaux d'entrée (séries temporelles par jour de service)
pms_daily (
  outlet_id, service_date,
  rooms_sold, guests_per_room,
  segment_mix jsonb, nationality_mix jsonb,
  -- INSIDE-OUT : profil guest (nouvelles colonnes clés)
  rate_code_mix     jsonb,  -- {"breakfast_inclusive":0.55,"room_only":0.30,"package":0.15}
  loyalty_tier_mix  jsonb,  -- {"titanium":0.08,"platinum_elite":0.12,"gold":0.25,...}
  travel_source_mix jsonb,  -- {"fit":0.45,"tour_group":0.30,"mice":0.10,...}
  departure_count   int,    -- chambres check-out demain
  departure_am_count int,   -- check-outs avant 11h (wave 1)
  lounge_eligible   int,    -- Titanium+ (diversion depuis buffet)
  late_arrivals_prev int,   -- arrivées après 23h (attach réduit J+1)
  los_distribution  jsonb,  -- {"day1":0.20,"day2_4":0.50,"day5plus":0.30}
  group_manifest    jsonb,  -- [{"group_id":"G001","size":42,"arrival_time":"07:15","source":"tour_group"}]
  early_checkins int, flight_arrivals int
)
weather_daily  (property_id, service_date, temp_c, rain_prob, humidity)
events_daily   (property_id, service_date, label, kind)
waste_measured (station_id, service_date, wave, kg, source)  -- source: winnow|manual

-- Sorties moteur
forecasts    (id, outlet_id, service_date, covers_p10, covers_p50, covers_p90,
              model_version, confidence, source_breakdown jsonb, created_at)
station_pars (forecast_id, station_id, wave, qty, expected_consumption, uncertainty)
actions      (forecast_id, rank, text, causal_text, est_saving_ntd, status)
              -- status: proposed|approved|done
prep_status  (station_id, service_date, wave, prepped_at, prepped_by)  -- tick-off live

-- Résultats & ESG
outcomes  (outlet_id, service_date, actual_covers, mape,
           waste_pct, saving_ntd_lauds, saving_ntd_winnow)
esg_log   (outlet_id, service_date, co2e_avoided_kg, water_avoided_l,
           bottles_avoided, gri306_payload jsonb)

-- Audit ML (obligatoire)
prediction_log (id, outlet_id, service_date, features jsonb,
                prediction jsonb, outcome jsonb, model_version, created_at)
```

---

## 5. Algorithme de prévision (inside-out)

### L'attach rate (remplace le flat 0.65)

```python
# Ne jamais utiliser covers = rooms × 1.6 × 0.65 flat.
# Toujours segmenter par profil guest.

ATTACH_BY_RATE_CODE = {
    "breakfast_inclusive": 0.92,
    "half_board":          0.88,
    "package_leisure":     0.75,
    "default":             0.60,
    "room_only":           0.27,
    "redemption_points":   0.50,
}

LOUNGE_DIVERT_TIERS = {"ambassador", "titanium"}  # → pas au buffet
LOUNGE_ATTACH_RATE  = 0.85

LOS_FATIGUE = {1:1.00, 2:0.97, 3:0.94, 4:0.91, "5+":0.85, "departure":1.05}

def compute_attach(rate_code, loyalty_tier, los_day,
                   departing_today, arrival_hour):
    base = ATTACH_BY_RATE_CODE.get(rate_code, 0.60)
    if loyalty_tier in LOUNGE_DIVERT_TIERS:
        base = max(0.05, base - LOUNGE_ATTACH_RATE)
    los_key = "departure" if departing_today else (los_day if los_day <= 4 else "5+")
    fatigue = LOS_FATIGUE[los_key]
    late = 0.40 if (arrival_hour or 0) >= 23 else 1.0
    return base * fatigue * late
```

### Split 3 vagues (conditionné par travel_source)

```python
WAVE_PROFILES = {
    # (wave1, wave2, wave3)
    "tour_group": (0.75, 0.20, 0.05),  # arrive tôt, spike wave 1
    "fit":        (0.20, 0.55, 0.25),  # staggered, wave 2 lourde
    "mice":       (0.45, 0.40, 0.15),
    "departure":  (0.80, 0.18, 0.02),  # pré-départ = très tôt
    "other":      (0.35, 0.45, 0.20),
}
# Wave split = moyenne pondérée des profils par volume de source
```

### Formule couverts (référence samedi W Taipei)

```
316 chambres × 1.6 guests/chambre × attach_segmenté = ~329 couverts
food_cost = 329 × NT$220 (= 25% d'un menu NT$880)
saving = food_cost × (12% - 8%) = NT$2,896/jour
  ↳ Winnow (réactif) ≈ NT$724  (1 point)
  ↳ Lauds (prédictif) ≈ NT$2,172  (3 points — à facturer)
```

### Pipeline complet (5 étages)
1. **Forecast couverts** : attach segmenté → P10/P50/P90 (régression quantile)
2. **Allocation station** : priors bayésiens nationalité × travel_source × LOS
3. **Timing 3 vagues** : newsvendor par vague avec Cu/Co asymétriques
4. **Re-prévision live** : pace signal + groupe → alertes + auto-actions sur approbation
5. **Boucle nocturne** : recalibration sur couverts réels + waste_measured

---

## 6. Surfaces et moments clés

```
18:00 J-1  →  Nightly brief (push/email/WhatsApp)
               Couverts P50, pars par station, 3 actions, NT$ estimate, PDF
06:00–10:30 →  Kitchen Cockpit (PWA tablette + écran mural)
               Live dashboard, tick-off stations, timeline 3 vagues, jauge pace
07:00–10:00 →  Live alerts (push + voix)
               Pace, gaspillage, groupe → auto-actions sur approbation
12:30 J+1  →  Debrief (email recap)
               Réel vs prévu, modèle recalibré, ESG loggé
```

---

## 7. Module ESG

```python
# Calcul CO₂e (sur waste_measured uniquement, jamais sur le modèle)
CO2E_FACTORS = {  # kg CO₂e / kg food
    "bread_pastry": 1.9,
    "meat":         27.0,
    "dairy":        3.2,
    "vegetables":   2.0,
    "seafood":      6.1,
    "default":      2.5,
}
co2e = sum(waste_kg[cat] * CO2E_FACTORS.get(cat, 2.5) for cat in waste_kg)

# Exports automatiques
# → Marriott Serve 360 (native)
# → Brouillon Taiwan FSC / TWSE (mensuel, IFRS S2 Scope 3)
# → GRI 306 mapping
# Mention obligatoire dans l'UI : "Measured by the bin — not modelled."
```

---

## 8. Module voix (Phase Pro)

```
Pipeline : wake-word / push-to-talk → STT (Whisper) → intent classification
           → tools (read forecast, mark station, trigger re-forecast, read brief)
           → TTS → speaker

Intents à couvrir :
  "combien de couverts congee pour 8h30 ?"
  "marque la station œufs comme prête"
  "c'est quoi mon pace ?"
  "lis-moi le brief"
  "alerte : Western Hot risque de surstock"  ← le système parle

Langues : mandarin + anglais minimum
Tests E2E : STT→intent→action→TTS, cas bruités, multilingues
```

---

## 9. Phases de build (ordre obligatoire)

```
Phase 0  Rebrand + init Next.js/TS + Supabase + CI
Phase 1  DB schema + migrations + RLS + seed W Taipei + auth
Phase 2  Connecteurs read-only (Winnow / PMS / météo) + fallback CSV
Phase 3  Moteur prévision (baseline GLM + backtest harness) ← BLOQUANT
Phase 4  PWA cockpit + brief J-1 + alertes + debrief
Phase 5  Module voix (STT/TTS + agent)
Phase 6  Module ESG + console auditeur
Phase 7  Démo interactive (lauds.ai) + calculateur ROI
Phase 8  Tests transverses + observabilité + load
```

---

## 10. Tests obligatoires

```python
# Toujours couvrir :
test_breakfast_inclusive_high_attach()     # ≥ 0.90
test_titanium_lounge_diversion()           # < 0.15
test_room_only_low_attach()                # ≤ 0.30
test_departure_day_boost()                 # > mid-stay
test_late_arrival_penalty()                # < 50% du normal
test_tour_group_wave1_heavy()              # wave1 > 0.60
test_saving_split_integrity()              # saving_lauds + saving_winnow ≤ saving_total
test_esg_from_measured_only()              # CO₂e ≠ 0 seulement si waste_measured existe
test_no_autoaction_without_approval()      # human-in-the-loop
test_backtest_mape_below_threshold()       # MAPE < X% (calibrer au pilote)
```

---

## 11. Commandes utiles

```bash
# Dev
npm run dev                    # Next.js local
supabase start                 # Supabase local
supabase db push               # Appliquer migrations

# Prévision
uvicorn app:app --reload       # Service Python local
python -m pytest tests/ -v     # Tests unitaires Python

# Seed données W Taipei
node scripts/seed_w_taipei.js  # Initialise org, property, outlet, 9 stations

# Backtest
python forecasting/backtest.py --outlet kitchen_table --weeks 4
# Résultat attendu : MAPE et waste% simulé vs historique

# Vérifier le rebrand (aucun résidu)
grep -ri "aubette\|serviceflow" src/ public/ --include="*.tsx,*.ts,*.html"
```

---

## 12. À ne jamais faire

```
✗  attach_rate = 0.65  (flat — trop imprécis)
✗  Attribuer les 4 points de réduction à Lauds seul
✗  Calculer le CO₂e depuis le modèle (uniquement depuis waste_measured)
✗  Auto-action sans approbation chef
✗  Déployer un modèle sans backtest validé
✗  Renommer le repo / casser l'URL GitHub Pages
✗  Stocker des PII guest individuelles
✗  Ignorer le RLS multi-tenant
```

---

## 13. Contacts & ressources

```
Jérémie Gougenheim (fondateur)   jeremie@sparkedge.ai · +852 69597595
Repo live                        https://jeremiegougenheim-creator.github.io/serviceflow-whotel/
Repo public                      github.com/jeremiegougenheim-creator/serviceflow-whotel
Repo privé                       github.com/jeremiegougenheim-creator/serviceflow
Domain de marque (à vérifier)    lauds.ai
Deck W Taipei v4                 voir /docs/Lauds_WTaipei_Deck_v4.pptx
Spec complète                    voir /docs/Lauds_ClaudeCode_Proto_vers_App.md
Patch algo inside-out            voir /docs/Lauds_ClaudeCode_Algo_Update.md
```

---

## 14. Data Governance (section critique — réponse aux questions IT/Legal)

### Les 3 engagements contractuels et architecturaux

```
ENGAGEMENT 1 — RESTE DANS VOTRE INFRASTRUCTURE
  - Supabase RLS strict par propriété (aucune donnée cross-client accessible)
  - Résidence des données en APAC garantie contractuellement
  - Lauds lit uniquement des signaux agrégés — jamais des enregistrements guests individuels
  - Export complet sur demande (CSV/JSON)
  - Suppression garantie sous 30 jours à la résiliation

ENGAGEMENT 2 — JAMAIS PARTAGÉE
  ✕ Partage cross-client
  ✕ Donnée brute transmise aux serveurs Lauds
  ✕ Hôtel identifiable dans les benchmarks
  ✕ Données guests individuelles traitées
  ✕ Rétention après résiliation
  ✕ Vente ou monétisation à des tiers

ENGAGEMENT 3 — ON APPREND DES PATTERNS, PAS DE VOS DONNÉES
  Court terme : benchmarks anonymisés agrégés (opt-in, aucun nom d'hôtel)
  Moyen terme : Federated Learning (vecteurs de mise à jour du modèle, pas de données)
  Long terme  : Differential Privacy sur les gradients
```

### Architecture technique de données

```python
# RÈGLE : les données brutes ne quittent JAMAIS l'instance Supabase du client

# Ce qui RESTE côté client :
# - pms_daily (occupancy, rate codes, tier mix, etc.)
# - waste_measured (Winnow)
# - forecasts, station_pars, outcomes
# - prediction_log (audit trail complet)
# - esg_log

# Ce qui PEUT être contribué au modèle global (opt-in, anonymisé) :
ANONYMIZED_BENCHMARK_CONTRIBUTION = {
    "hotel_type": "luxury_400plus_keys",  # catégorie, jamais le nom
    "market": "APAC_Taiwan",              # région, jamais la ville
    "avg_attach_by_rate_code": {...},      # taux moyen, agrégé
    "avg_station_pref_by_nationality": {...},
    "avg_mape_by_day_type": {...},
    # ⚠️ JAMAIS : nom d'hôtel, données temporelles identifiables, NT$ absolus
}
```

### Contrats à préparer avant signature client

```
1. DPA (Data Processing Agreement)
2. Clause de résidence des données (APAC uniquement)
3. Clause d'audit (1x/an, 30 jours préavis)
4. Clause de contribution benchmark (opt-in, révocable)
5. Clause de sortie (export 5j, suppression 30j)
```

### Tests de sécurité à implémenter (Phase 8)

```python
test_rls_no_cross_tenant_access()    # tenant A ne voit jamais les données de B
test_no_pii_in_benchmark_export()    # benchmark ne contient aucun identifiant
test_data_deletion_complete()        # suppression totale vérifiable post-résiliation
test_export_includes_all_tables()    # export complet = toutes les tables du client
test_supabase_region_apac()          # vérifier la région d'hébergement au build
```

---

## 15. Connecteur POS / Oracle Simphony (Phase 2 — implémenté)

### Architecture 5 feeds W Taipei

```
Feed 1  Winnow          READ  →  waste mesuré par station (quotidien)
Feed 2  PMS / OPERA     READ  →  profil guest (tier, rate code, travel source, LOS...)
Feed 3  Météo           READ  →  temp · pluie · gradient (5 jours)
Feed 4  Events          READ  →  Computex, CNY, conférences (manuel ou API)
Feed 5  POS Simphony    READ  →  pace couverts toutes les 15 min
```

### Implémenté dans connectors/simphony.py

- OAuth 2.0 client_credentials + token cache
- APScheduler 06:00–10:30 toutes les 15 min
- Fallback push notification chef si API down
- PaceCheckButton.tsx (cockpit) — bouton manuel si POS muet > 18 min
- pace_log table (005_pace_log.sql)
- Wave split blend priors → historique (J14–J30+)

### Variables d'env requises

```
SIMPHONY_BASE_URL, SIMPHONY_CLIENT_ID, SIMPHONY_CLIENT_SECRET,
SIMPHONY_REVENUE_CENTER_ID, LAUDS_OUTLET_ID
```

---

## 16. Property Theming System (feature vendable)

### Principe
L'app s'habille dans la palette in-property de chaque propriété. Un seul produit, N identités visuelles. Argument de vente : *"Le cockpit s'habille dans votre palette in-property."*

### Table property_themes (Supabase)

```sql
CREATE TABLE property_themes (
  property_id   uuid REFERENCES properties(id) PRIMARY KEY,
  theme_name    text DEFAULT 'lauds_default',
  bg_primary    text DEFAULT '#FAF8F4',
  bg_card       text DEFAULT '#FFFFFF',
  text_primary  text DEFAULT '#2A2520',
  text_secondary text DEFAULT '#4A453F',
  text_muted    text DEFAULT '#8C857C',
  accent_action text DEFAULT '#16A6EC',  -- actions, confirmations
  accent_savings text DEFAULT '#4A8F5E', -- économies, ESG
  accent_alert  text DEFAULT '#E01E8C',  -- alertes gaspillage
  divider       text DEFAULT '#E2DDD4',
  font_heading  text DEFAULT 'Cormorant Garamond',
  updated_at    timestamptz DEFAULT now()
);
```

### Seed — W Taipei theme

```sql
INSERT INTO property_themes VALUES (
  '<W_TAIPEI_PROPERTY_ID>', 'w_hotels_inproperty',
  '#F7F3EE', '#E0D9CF', '#1A1714', '#3E3934', '#8C8479',
  '#2B5BDB', '#2DA06B', '#D4431F', '#C4BAA9', 'Cormorant Garamond'
);
-- W Hotels brand (Porto Rocha × Lineto, 2024)
```

### Implémentation

- `app/src/lib/theme.ts` — PropertyTheme interface, applyTheme, buildCssVars
- `app/src/app/globals.css` — --lauds-* CSS custom properties
- `app/src/app/(app)/layout.tsx` — chargement server-side, injection via style prop

### Thèmes disponibles

| Propriété | Theme | Bg | Action | Savings |
|---|---|---|---|---|
| Défaut (Lauds) | lauds_default | #FAF8F4 | #16A6EC | #4A8F5E |
| W Taipei | w_hotels_inproperty | #F7F3EE | #2B5BDB | #2DA06B |
| Jaravee (3/4★) | resort_neutral | #F5F1EB | #1D6FA3 | #2A8A52 |
| Marriott (générique) | marriott_classic | #F8F5F0 | #B5121B | #2D6A3F |

### Tests

```python
test_theme_loads_for_property()     # theme correct chargé selon property_id
test_default_theme_if_missing()     # fallback Lauds si pas de theme
test_css_vars_applied_on_load()     # variables CSS correctement setées
test_no_hardcoded_colors_in_jsx()   # grep 'background.*#' dans src/ → 0 résultat
```

### Argument commercial

Pour Bastien : *"Le cockpit cuisine s'habille dans votre palette in-property W Hotels. Vos chefs ne voient pas une app externe — ils voient quelque chose qui ressemble à W."*
Pour Jaravee : même produit, couleurs différentes, NT$0 de surcoût.

---

## 17. App architecture · roles · bidirectional notification flow

### Principe central
L'app n'est pas un dashboard que le chef consulte. C'est un **système de coordination opérationnel** où chaque rôle reçoit l'information dont il a besoin pour agir, et peut remonter du signal au reste de l'équipe.

### Les 4 vues de l'app (tout le monde y a accès, profondeur selon rôle)

```
TODAY     — brief, 3 actions, NT$/ESG (vue GM/F&B Mgr par défaut)
TEAM      — daily roster, station assignments (vue chef au matin)
STATIONS  — grille live, tick-off, alertes (vue principale en service)
HISTORY   — debrief, ESG exports, audit trail (vue auditeur)
```

### Les 6 rôles

| Rôle | Vue par défaut | Peut faire | Ne voit PAS |
|---|---|---|---|
| GM | TODAY (summary) | Lire brief, voir NT$/ESG | Détails tactiques |
| F&B Manager | TODAY (full) | Lire, approuver, override | Activité prep individuelle |
| Chef | STATIONS (live) | Tout (admin) | Rien |
| Sous-chef | STATIONS (les siennes) | Tick-off ses stations, flag | Autres stations en grisé |
| Prep cook | TODAY → ma station | Voir liste prep, marquer ready | Stratégique, NT$, ESG |
| Auditeur | HISTORY (read-only) | Voir ESG, exports | Live data |

### Tables Supabase additionnelles

```sql
-- Membres persistants par propriété
team_members (
  id            uuid PK,
  property_id   uuid → properties,
  name          text,
  role          text,            -- 'chef'|'sous_chef'|'prep_cook'|'fnb_mgr'|'gm'|'auditor'
  phone         text,            -- pour WhatsApp routing
  email         text,
  active        bool DEFAULT true,
  created_at    timestamptz
)

-- Roster confirmé du jour (résout le "pas la même équipe tous les jours")
daily_assignments (
  id               uuid PK,
  outlet_id        uuid → outlets,
  service_date     date,
  team_member_id   uuid → team_members,
  station_id       uuid → stations,  -- NULL pour chef/GM/F&B (pas de station)
  wave             text,             -- 'all' pour sous-chef, 'wave1'|'wave2'|'wave3' pour prep
  confirmed_at     timestamptz,      -- NULL si pas encore confirmé par chef
  acknowledged_at  timestamptz       -- NULL si membre n'a pas accusé réception
)
-- UNIQUE(outlet_id, service_date, team_member_id)

-- Tick-off live (le flux qui REMONTE)
station_status (
  id               uuid PK,
  station_id       uuid → stations,
  service_date     date,
  wave             text,
  status           text,             -- 'prepped'|'running_low'|'closed'
  updated_by       uuid → team_members,
  updated_at       timestamptz,
  photo_url        text              -- optionnel
)

-- Issues remontées (one-tap depuis n'importe quel team member)
flags (
  id               uuid PK,
  outlet_id        uuid → outlets,
  service_date     date,
  station_id       uuid → stations,  -- NULL si flag général
  kind             text,             -- 'running_low'|'quality_issue'|'equipment'|'safety'
  raised_by        uuid → team_members,
  raised_at        timestamptz,
  resolved_at      timestamptz,
  notes            text
)

-- Saisie manuelle gaspillage (fallback si pas de Winnow)
manual_waste_entry (
  id               uuid PK,
  station_id       uuid → stations,
  service_date     date,
  kg               numeric,
  entered_by       uuid → team_members,
  entered_at       timestamptz
)
-- Alimente waste_measured.source = 'manual_fallback'
```

### Matrice de notifications (qui reçoit quoi, par quel canal)

```
                        GM        F&B Mgr      Chef          Sous-chef         Prep cook
                        (top)     (full)       (admin)       (their station)   (their station)
─────────────────────────────────────────────────────────────────────────────────────────
18:00 J-1 brief         WhatsApp  Email+push   Push tablet    —                 —
05:30 check-in          —         —            CONFIRMS       Acknowledge      Acknowledge
05:45 pre-service       —         Full brief   All stations  Their pars       Their prep list
LIVE (06:00-10:30)
  - pace alert          —         —            Push           Their station    —
  - running low         —         —            Push approve  Push urgent      Action push
  - waste prevention    —         Notif        Push approve  Their station    —
  - group arrival       —         Notif        Push approve  Affected station —
11:00 close             —         —            Confirms      Enters waste kg  —
12:30 debrief           NT$+ESG   Full         Learning      Their station    —
─────────────────────────────────────────────────────────────────────────────────────────
EVENT-DRIVEN (groupe last-minute, météo flip, capteur anormal, etc.)
                        → routing dynamique selon le scope (cf. notification_rules.py)
```

### Notification routing — code

```python
# services/notifications.py

def notify(event_kind: str, payload: dict, service_date: date, outlet_id: uuid):
    """
    Route une notification vers les bonnes personnes selon
    leur rôle ET leur assignation du jour (daily_assignments).
    """
    rules = NOTIFICATION_RULES[event_kind]  # cf. matrice ci-dessus
    
    # Récupère le roster confirmé du jour
    assignments = db.query(
        "SELECT * FROM daily_assignments "
        "WHERE outlet_id = ? AND service_date = ? AND confirmed_at IS NOT NULL",
        (outlet_id, service_date)
    )
    
    for assignment in assignments:
        member = get_member(assignment.team_member_id)
        
        # La personne reçoit-elle cet événement ?
        if member.role not in rules['recipients']:
            continue
        
        # Si l'événement est station-specific, ne notifier que les
        # team members assignés à cette station
        if payload.get('station_id') and assignment.station_id != payload['station_id']:
            continue
        
        # Construit le payload personnalisé selon le rôle
        message = build_payload(rules['template'], payload, member.role)
        
        # Envoie sur le bon canal
        for channel in rules['channels'][member.role]:
            send(member, channel, message)
```

### Tests obligatoires

```python
test_notification_routing_by_role()           # GM ≠ chef ≠ sous-chef
test_station_specific_only_to_assigned()      # sous-chef ne reçoit pas les autres stations
test_unconfirmed_roster_no_notifications()    # pas de notif sans confirm chef
test_flag_creates_notification_to_chef()      # le UP-flow fonctionne
test_manual_waste_writes_to_waste_measured()  # fallback Winnow correct
test_acknowledged_at_set_on_notif_open()      # confirmation de lecture
```

### Argument commercial

Pour Bastien : *"Vos sous-chefs ne reçoivent pas tout le brief — ils reçoivent leur station. Vos prep cooks reçoivent leur liste, pas la stratégie. Personne n'est noyé sous l'info. Et n'importe qui peut remonter un problème en un tap."*

Comparé à ce qui existe : zéro autre outil F&B ne fait du routing par rôle ET par assignation du jour. La plupart envoient à "le chef" — un seul email — qui doit transmettre. Lauds parle directement à la bonne personne.
