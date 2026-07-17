---
Task ID: 1
Agent: Main
Task: Rebuild Abaya Collection orders management system with all V4.1.3 audit fixes

Work Log:
- Discovered project at /home/z/abaya-audit3 no longer exists (session continuation)
- Rebuilt entire orders management system in /home/z/my-project
- Created Prisma Order model with 14 fields, pushed to SQLite
- Seeded 47 orders (40 active, 7 archived) across 6 cities, 5 statuses
- Created i18n dictionaries (FR/EN/AR) with 40+ keys each
- Built 3 API routes: GET /api/orders, PATCH /api/orders/[id], POST /api/orders/archive
- Built OrdersTable.tsx with staged editing system, DataQualityIcon, popover, sliding-window pagination
- Built OrdersPillar.tsx with proper state management and search sync
- Ran ESLint — 0 errors
- Built production bundle successfully
- Verified all features via agent-browser + curl:
  - Search on 7 fields (name, phone, city, address, product, color, price) ✅
  - Search input syncs on tab/filter change ✅
  - Pagination (sliding window delta=2, page buttons, prev/next) ✅
  - Staged editing (double-click → input → blur → amber bar + green dot) ✅
  - Popover with old/new value + Restore button ✅
  - Restore clears all staged indicators ✅
  - Archive rule: delivered + cancelled only (not confirmed) ✅
  - CA: no double-counting (productPrice IS total, not multiplied by qty) ✅
  - Checkbox click doesn't propagate to row (FX29 fix via TableCell onClick stopPropagation) ✅

Stage Summary:
- All 3 audit points implemented and verified
- Files created: prisma/schema.prisma (updated), src/lib/i18n/dictionaries.{ts,en.ts,ar.ts}, src/app/api/orders/route.ts, src/app/api/orders/[id]/route.ts, src/app/api/orders/archive/route.ts, src/components/orders/OrdersTable.tsx, src/components/orders/OrdersPillar.tsx, src/app/page.tsx
- Key architectural decisions:
  1. Search sync: `useEffect(() => { setSearchInput(search); }, [search])` in OrdersTable + `setSearch('')` in parent on view/filter change
  2. Archive rule: `status: { in: ['delivered', 'cancelled'] }` (changed from delivered+confirmed)
  3. Staged editing: `Map<string, Record<string, string>>` state, amber bg + green dot indicators, Popover with diff, global Save/Cancel bar
  4. CA calculation: `sum(productPrice)` — NO multiplication by productQuantity (productPrice stores unit×qty total)