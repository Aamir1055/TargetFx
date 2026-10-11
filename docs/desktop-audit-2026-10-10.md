# Desktop audit — 10 October 2026

Reviewed the current local application. No application code was changed during this audit.

## Scope and limitations

- Production build tested in an isolated headless Chrome profile at 1440 × 900.
- Brokerage Data also checked at 1024 × 768.
- Browser requests were intercepted and answered with synthetic fixtures; no production account or financial operation was used.
- All 14 authenticated routes were opened: Clients, Positions, Pending Orders, Margin Level, Live Dealing, Client Percentage, Bills, Brokerage Data, Historical Positions, Deals, Broker Rules, Analytics, the alternate Client Dashboard route, and Settings.
- This is route smoke coverage plus selected interaction/edge-case tests, not an exhaustive end-to-end certification. Live login/2FA, real data accuracy, WebSocket traffic, mutations, all modal combinations, and complete export/download workflows remain unverified.

## Findings

| Priority | Area | Issue | Evidence |
| --- | --- | --- | --- |
| High | Historical Positions | Search only filters the current page, so matching symbols on another page are missed. | Browser reproduced; request payload inspected. |
| High | Client details → Positions | Searching or sorting fetches only 15 positions, with no server pagination to retrieve the remaining matches. | Confirmed in source; large-result browser reproduction still needed. |
| Medium | Pending Orders | An API failure leaves the initial table displaying skeletons without an error message. | Browser reproduced with HTTP 500 responses. |
| Medium | Reports → Deals | The entire desktop table, including headers, disappears when the result is empty. | Browser reproduced with an empty deals response. |
| Medium | Margin Level | Empty results produce page 1 of 0, and Next remains enabled. | Browser reproduced; button condition confirmed in source. |
| Low | Analytics | Zero-data accounts display `NaN%` for equity ratio and active trading rate. | Browser reproduced; division by zero confirmed in source. |

### 1. Historical Positions search misses other pages

**Reproduction:** Return GOLDDEC on page 1 and SILVERDEC on page 2, then search SILVERDEC from page 1. The UI displays “No matching symbols found.” The new request still sends page 1, limit 100, dates, threshold, and percentage; it does not send the search text.

**Cause:** The page filters the already paginated `report` array locally. The API wrapper also does not forward a search parameter. A search therefore cannot discover matching records outside the currently loaded page.

**Locations:** `src/pages/HistoricalPositionsPage.jsx:155`, `src/pages/HistoricalPositionsPage.jsx:185`, `src/services/api.js:891`.

**Expected:** Search across the report dataset using a supported backend search parameter, or clearly implement complete-data search if the endpoint has no search support. Pagination should represent matching records.

### 2. Client-detail position searches are capped at 15

**Trigger:** Open a client's Positions tab and search or sort a dataset with more than 15 matching positions.

**Cause:** The search effect hardcodes `page: 1` and `limit: 15`. It does not depend on `positionsCurrentPage` or `positionsItemsPerPage`. The visible pager is calculated from the returned array length and slices that array locally, so it cannot request subsequent server pages. The desktop row-size state defaults to 100, which makes the cap particularly misleading.

**Locations:** `src/components/ClientPositionsModal.jsx:1046`, `src/components/ClientPositionsModal.jsx:1086`, `src/components/ClientPositionsModal.jsx:2180`.

**Expected:** Use the selected server page and page size, retain the API total, and refetch when either changes.

### 3. Pending Orders remains in loading state after API errors

**Reproduction:** Open Pending Orders with `/api/broker/orders/search` returning HTTP 500. After multiple failed polling attempts, the table still contains skeleton placeholders and no visible error/retry explanation.

**Cause:** The catch branch only logs the failure. `hasFetchedOrders` is set only on success; rendering uses `!hasFetchedOrders || isPageLoading` to select skeletons.

**Locations:** `src/pages/PendingOrdersPage.jsx:489`, `src/pages/PendingOrdersPage.jsx:1464`.

**Expected:** Finish the loading state, show a recoverable error within the persistent table, and permit retry without implying that a failed request is still loading.

### 4. Deals report removes headers for empty results

**Reproduction:** Open Reports → Deals with an empty deals response. The desktop table has zero header cells and is replaced by “No deals found.” The same rendering branch is used when a search returns no matches.

**Location:** `src/pages/DealsReportPage.jsx:807`.

**Expected:** Retain the table header and place the empty/error message in a spanning body row, consistent with the updated Brokerage Data screen.

### 5. Margin Level has invalid empty-state pagination

**Reproduction:** Return an empty margin-call client list. Current page stays 1 while total pages becomes 0. The Next button is enabled because it only checks equality with total pages.

**Locations:** `src/pages/MarginLevelPage.jsx:566`, `src/pages/MarginLevelPage.jsx:831`.

**Expected:** Clamp the displayed page count to at least 1 and disable Next when the current page is greater than or equal to the final page, including empty results.

### 6. Analytics displays invalid percentages with zero totals

**Reproduction:** Load Analytics with zero total balance and zero clients. The UI shows “Equity ratio at NaN%” and “NaN% active trading rate.”

**Locations:** `src/pages/GraphicalAnalyticsPage.jsx:776`, `src/pages/GraphicalAnalyticsPage.jsx:793`.

**Expected:** Guard zero denominators and show `0%` or an explicit unavailable value.

## Checks that passed

- Production build, including PWA generation.
- Four latest-request regression tests.
- Six authentication regression tests.
- All 14 route smoke tests completed without uncaught JavaScript exceptions in the exercised initial states.
- No document-level horizontal overflow at 1440 px for those initial states; Brokerage Data also passed at 1024 px.
- Client Percentage race scenario: type `9000`, delay that response, then type `90005`. Final table contains only 90005; Total Clients and Total Custom both show 1.
- Brokerage Data keeps all seven fixture header cells when a search returns no matches.
- Bills rendered the synthetic settlement week and three account rows after supplying the endpoint's expected `data.weeks` response shape. Actual bill downloads were not validated.

## Static-check result

`eslint src` reports 567 errors and 106 warnings. These are not 673 confirmed product bugs: many are unused variables, empty catches, and hook dependency warnings.

Undefined references were also found in an unreferenced bulk-update component, an unused Bills CSV helper, and an apparently inactive deal-entry sort branch. They are not included as reproduced desktop failures because an active UI path was not established. The missing definitions should still be cleaned up before those paths are reused.

Build warnings flag large JavaScript chunks and outdated Browserslist data. They are maintenance/performance concerns, not proof of a functional failure.

## Suggested fix order

1. Historical Positions search and client-detail server pagination, because both can hide valid records.
2. Failed-request loading states.
3. Persistent empty table layout and pagination boundaries.
4. Analytics zero-value formatting and lint cleanup.
