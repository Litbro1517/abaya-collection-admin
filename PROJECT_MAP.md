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

**Statut : 🔧 EN COURS — branche `fix/search-case-sensitivity`**

| ID | Module | Correction | Fichier |
|---|---|---|---|
| FX-CaseSens | Recherche | Ajout de `mode: 'insensitive'` sur les 8 clauses `contains` du `where.OR`. Force `ILIKE` sur PostgreSQL pour une recherche insensible à la casse. | `route.ts` L28-44 |

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
- **Recherche** : 8 champs — nom, téléphone, ville, adresse, produit, couleur, taille, prix