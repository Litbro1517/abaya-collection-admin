# PROJECT_MAP — Abaya Collection Admin

## Versions déployées

### V4.1.3 — Corrections de régression + Architecture Staged Editing

**Statut : ✅ DÉPLOYÉ (main)**

| ID | Module | Correction | Fichier |
|---|---|---|---|
| FX-Search | Recherche | Sync `searchInput` ↔ prop `search` via `useEffect`. Recherche étendue à 8 champs (ajout `customerAddress`, `productPrice`). | `OrdersTable.tsx` L107-109, `route.ts` L31-40 |
| FX-Pagination | Pagination | Sliding window `generatePageButtons(current, total, delta=2)`. Boutons numérotés cliquables + ellipses. | `OrdersTable.tsx` L52-73 |
| FX-Archive | Archivage | Règle métier : `status: { in: ['delivered', 'cancelled'] }`. `confirmed` retiré, `cancelled` ajouté. | `archive/route.ts` L20 |
| FX-CA | Chiffre d'affaires | `productPrice` = prix unitaire. CA = `sum(productPrice × productQuantity)`. | `route.ts` L56-62 |
| FX-Staged | Édition staged | `Map<string, Record<string, string>>`. Indicateurs amber/vert, Popover ancien/nouveau, barre Enregistrer/Annuler, bouton Restaurer. | `OrdersTable.tsx` L120-230 |
| FX-Quality | DataQualityIcon | Étendu à `productName`, `productColor`, `productSize`, `productImage`, `productPrice`. | `OrdersTable.tsx` L76-115 |
| FX-Checkbox | Sélection | `onClick={e => e.stopPropagation()}` sur `TableCell` (pas sur `onCheckedChange`). | `OrdersTable.tsx` L310-315 |

### V4.1.4 — Correction sensibilité à la casse (Recherche)

**Statut : ❌ CASSÉ — remplacé par V4.1.5**

| ID | Module | Correction | Fichier |
|---|---|---|---|
| FX-CaseSens | Recherche | Ajout de `mode: 'insensitive'` sur les 8 clauses `contains` du `where.OR`. Force `ILIKE` sur PostgreSQL pour une recherche insensible à la casse. | `route.ts` L28-44 |

> ⚠️ **RÉGRESSION** : `mode: 'insensitive'` est **PostgreSQL-only**. Sur SQLite (provider configuré dans `schema.prisma`), Prisma lève une `PrismaClientValidationError` ("Unknown argument `mode`") à l'exécution → HTTP 500 → la recherche ne renvoie **aucun résultat**. Le commentaire inline prétant un "fallback silencieux vers LIKE sur SQLite" était factuellement erroné. Corrigé en V4.1.5.

### V4.1.5 — Recherche robuste cross-DB (correctif V4.1.4)

**Statut : 🔧 EN COURS — branche `fix/search-robust-v4.1.5`**

| ID | Module | Correction | Fichier |
|---|---|---|---|
| FX-SearchRobust | Recherche | Remplacement de `mode: 'insensitive'` par une requête `$queryRaw` paramétrée. `LOWER()` pour la casse (ASCII SQLite / Unicode PostgreSQL). `CAST(... AS TEXT)` pour les champs numériques. `datetime(x/1000,'unixepoch')` pour les dates (SQLite stocke les DateTime en epoch-ms). Échappement des jokers LIKE (`%`, `_`). | `route.ts` (intégralité du GET) |

**Champs recherchés (11)** :
- Texte (8) : `customerName`, `customerPhone`, `customerCity`, `customerAddress`, `productName`, `productColor`, `productSize`, `productPrice`
- Numérique (1) : `productQuantity` (Int → `CAST AS TEXT`)
- Statut (1) : `status`
- Date (1) : `createdAt` (DateTime → `datetime()/1000, 'unixepoch'`)

**Sécurité** : toutes les valeurs utilisateur sont liées via `Prisma.sql` (paramètres bindés, anti-injection SQL). Les jokers LIKE sont échappés pour un traitement littéral.

**Tests de validation (curl, 10 scénarios)** :
- `yasmine` (minuscule) → 4 résultats ("Yasmine F.") ✅ casse insensible
- `AGADIR` (MAJUSCULE) → 6 résultats ("Agadir") ✅ casse insensible
- `738` (numérique) → 1 résultat (productPrice=738) ✅ type numérique
- `pending` (statut) → 8 résultats ✅ champ status
- `2026-07-17` (date) → 47 résultats ✅ type date
- `20:08` (heure) → 47 résultats ✅ recherche temporelle
- `abaya` → 40 résultats ✅ texte standard
- `_` (joker LIKE) → 0 résultat ✅ joker échappé (traitement littéral)
- `view=archived` → 7 archivées ✅ filtre archive intact
- `zzzzznotexist` → 0 résultat ✅ aucun match gracieux (pas de 500)

**Note technique SQLite** : Prisma stocke `DateTime` comme entier epoch-ms en SQLite (`1784318910427`), pas comme chaîne ISO. `CAST(createdAt AS TEXT)` retourne donc la chaîne numérique, pas une date. `datetime(x/1000, 'unixepoch')` convertit en `"YYYY-MM-DD HH:MM:SS"`. Un passage futur à PostgreSQL nécessiterait d'ajuster cette seule ligne (remplacer par `CAST(createdAt AS TEXT)` qui donne directement l'ISO).

## Architecture

```
src/
├── app/
│   ├── page.tsx                          # Point d'entrée → OrdersPillar
│   └── api/orders/
│       ├── route.ts                      # GET — liste (search, pagination, CA)
│       ├── [id]/route.ts                 # PATCH — édition cellule
│       └── archive/route.ts              # POST — archivage (delivered+cancelled)
├── components/orders/
│   ├── OrdersPillar.tsx                  # Parent — state (page, search, view, filter)
│   └── OrdersTable.tsx                   # Table — staged editing, DataQualityIcon, pagination
└── lib/
    ├── db.ts                             # Prisma client (SQLite)
    └── i18n/
        ├── dictionaries.ts               # FR (défaut)
        ├── dictionaries.en.ts            # EN
        └── dictionaries.ar.ts            # AR
```

## Schéma Prisma (Order)

| Champ | Type | Rôle |
|---|---|---|
| `productPrice` | `String` | Prix **unitaire** |
| `productQuantity` | `Int` | Quantité |
| `status` | `String` | `pending` / `confirmed` / `shipped` / `delivered` / `cancelled` |
| `isDeleted` | `Boolean` | Archivage (false=active, true=archivée) |

## Règles métier (V4.1.3)

- **Archivage** : Seules les commandes `delivered` et `cancelled` sont éligibles
- **CA** : `sum(productPrice × productQuantity)` — productPrice est un prix unitaire
- **Édition** : Staged (pas de sauvegarde immédiate) — validation via bouton "Enregistrer" global
- **Recherche** : 11 champs (V4.1.5) — nom, téléphone, ville, adresse, produit, couleur, taille, prix (texte), quantité (numérique), statut, date de création (date). Insensible à la casse, cross-DB, via `$queryRaw` + `LOWER()` + `CAST`/`datetime()`.