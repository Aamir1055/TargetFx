# Frontend epoch time conversion — Live Dealing

Reviewed: 12 October 2026. This document describes the current workspace implementation; no application behavior was changed.

## What the Time column shows

The Live Dealing screen displays time as **DD/MM/YYYY HH:mm:ss**, using a 24-hour clock. The highlighted screenshot value, `12/10/2026 19:20:04`, means **12 October 2026 at 7:20:04 PM**.

The frontend preserves the server clock fields encoded in the API value. It does **not** convert the displayed value to the browser's local timezone.

The comment in `src/utils/dateFormatter.js` states that this application's MT5 timestamps contain server wall-clock time (IST) encoded as though it were UTC. This is the frontend's data-contract assumption, not a property of all Unix timestamps or all MT5 integrations. The screenshot alone cannot establish the actual API timestamp or backend timezone configuration.

## Data flow

1. The `/live-dealing` route renders `src/pages/LiveDealingPage.jsx`. Its mobile view uses `src/components/LiveDealingModule.jsx`.
2. API deals provide `deal.time`, with `deal.timestamp` used as a fallback when mapping the response.
3. The desktop Time cell calls `formatTime(deal.time || deal.timeStr || deal.rawData?.timeStr)`.
4. The page's local `formatTime` wrapper calls the shared helper: `apiFormatTime(timestamp, '-')`.
5. The shared helper in `src/utils/dateFormatter.js` normalizes numeric values to milliseconds, reads UTC date/time fields, and formats the result. The mobile Time cell also uses this shared helper.

## How numeric epoch values are converted

JavaScript `Date` takes milliseconds. The existing `toMs()` helper accepts numbers or numeric strings:

```js
export const toMs = (ts) => {
  if (!ts) return 0
  const n = Number(ts)
  if (!isFinite(n) || n <= 0) return 0
  return n < 10000000000 ? n * 1000 : n
}
```

Values below 10 billion are treated as seconds and multiplied by 1,000. Larger values are treated as milliseconds. This is a heuristic suited to the application's contemporary timestamps.

The formatter then creates `new Date(toMs(value))` and reads:

```js
date.getUTCDate()
date.getUTCMonth() + 1 // JavaScript months start at zero
date.getUTCFullYear()
date.getUTCHours()
date.getUTCMinutes()
date.getUTCSeconds()
```

Day, month, hour, minute, and second are padded to two digits. Using UTC getters avoids applying the viewer's browser timezone to these fields.

## Example matching the screenshot

The following is a calculated example that reproduces the screenshot, not a captured API response:

| Stage | Value |
| --- | --- |
| Example API epoch in seconds | `1791832804` |
| Convert to milliseconds | `1791832804 * 1000 = 1791832804000` |
| Read encoded UTC fields | `2026-10-12 19:20:04` |
| Display in the Time column | `12/10/2026 19:20:04` |

Reuse the existing helper in frontend components:

```jsx
import { formatTime } from '../utils/dateFormatter'

const apiTime = 1791832804
const label = formatTime(apiTime, '-')
// label: "12/10/2026 19:20:04"

return <td>{label}</td>
```

These inputs produce the same display:

```js
formatTime(1791832804, '-')
formatTime('1791832804', '-')
formatTime(1791832804000, '-')
formatTime('2026-10-12 19:20:04', '-')
```

## Timezone handling

A standard Unix epoch represents an instant measured from 1 January 1970 UTC. This frontend instead interprets the supplied deal epoch according to the server-wall-clock convention described above.

For display, `formatTime()` does not add IST's 5 hours 30 minutes, subtract an offset, or use the viewer's timezone. Adding another offset here would change the clock value shown in the screenshot.

`SERVER_UTC_OFFSET_SEC` is configured separately:

```js
Number(import.meta?.env?.VITE_SERVER_UTC_OFFSET_MINUTES ?? 330) * 60
```

Its default is 330 minutes, or UTC+05:30. The helper `serverNowEpoch()` adds that offset to the current standard epoch to construct the application's server-clock epoch. This affects current-time/date-filter calculations; it does not affect how an existing deal timestamp is formatted. The deployed environment may override the default.

## Date filters: converting selected dates back to epoch

`src/utils/dealTimePresets.js` builds preset ranges using the server clock. “Today” runs from server-calendar midnight to the current server-clock epoch.

`serverEpochFromParts()` constructs epoch seconds directly from the intended wall-clock fields:

```js
Math.floor(Date.UTC(year, month, day, hours, minutes, seconds) / 1000)
// month is zero-based
```

`toServerEpoch(date)` reads a Date's local calendar fields and passes those fields into `serverEpochFromParts()`. `fromServerEpoch()` does the reverse field-copy operation, creating a local Date with matching wall-clock fields for date controls. These are wall-clock adapters, not general-purpose conversions that preserve an absolute instant.

On the desktop page, custom `DD/MM/YYYY` and `YYYY-MM-DD` dates are parsed with `Date.UTC`. The start is midnight; the end adds 86,399 seconds to include `23:59:59`. The page passes `from` and `to` in seconds to `brokerAPI.getAllDeals(...)`. A Time-column custom filter can override those boundaries.

## String inputs and missing values

- The shared formatter also recognizes year-first and day-first date strings, with `-`, `.`, or `/` separators and optional time.
- A recognized date-only string displays without a time suffix.
- Missing values and zero display `-` through the Live Dealing wrapper. The shared helper's own default placeholder is `N/A`.
- Unrecognized nonempty strings are returned unchanged. String parsing extracts written calendar fields; it does not apply a trailing timezone offset.
- The helper is a formatter, not strict date validation: malformed calendar dates and out-of-range numeric dates are not comprehensively rejected.

## Current implementation caveats

Both desktop and mobile WebSocket insertion paths fall back to `Math.floor(Date.now() / 1000)` when an incoming deal has no timestamp. That fallback is a standard UTC epoch, unlike `serverNowEpoch()`. Under the documented server-clock convention, the displayed fallback can therefore differ from the intended server time by the configured offset. This document records the behavior; it does not change it.

Desktop custom-date parsing explicitly handles two date formats. Mobile custom-date filtering uses `new Date(appliedFromDate)` and `new Date(appliedToDate)`, so it depends on the supplied string format and JavaScript parsing behavior.

## Verification and source files

The actual shared helper was executed in Node.js. Epoch seconds `1791832804`, milliseconds `1791832804000`, and the string `2026-10-12 19:20:04` each produced `12/10/2026 19:20:04`. A null input with the Live Dealing placeholder produced `-`. No live API response was inspected.

- [Shared formatting and server-clock helpers](../src/utils/dateFormatter.js)
- [Desktop Live Dealing page](../src/pages/LiveDealingPage.jsx)
- [Mobile Live Dealing module](../src/components/LiveDealingModule.jsx)
- [Preset date ranges](../src/utils/dealTimePresets.js)
- [API service](../src/services/api.js)
