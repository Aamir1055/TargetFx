# Dashboard Components

Component-Driven Design (CDD) dashboard system for Broker Eyes.

## Components

### StatCard
Displays key metrics with visual indicators, gradients, and change indicators.

**Props:**
- `title` - Metric label
- `value` - Main value to display
- `change` - Change indicator text
- `changeType` - 'positive' | 'negative' | 'neutral'
- `icon` - SVG icon element
- `gradient` - Tailwind gradient classes
- `loading` - Loading state

**Usage:**
```jsx
<StatCard
  title="Total Clients"
  value="1,234"
  change="+12% from last month"
  changeType="positive"
  icon={<svg>...</svg>}
  gradient="from-blue-500 to-blue-600"
/>
```

### QuickActionCard
Interactive card for navigation and quick actions.

**Props:**
- `title` - Action title
- `description` - Action description
- `icon` - SVG icon element
- `gradient` - Tailwind gradient classes
- `onClick` - Click handler
- `path` - Navigation path

**Usage:**
```jsx
<QuickActionCard
  title="View Clients"
  description="Manage client accounts"
  path="/clients"
  icon={<svg>...</svg>}
  gradient="from-blue-500 to-blue-600"
/>
```

### MiniDataTable
Compact table for displaying data snapshots with "View All" action.

**Props:**
- `title` - Table title
- `headers` - Array of header strings
- `rows` - 2D array of table data
- `onViewAll` - Callback for "View All" button
- `loading` - Loading state
- `emptyMessage` - Message when no data

**Usage:**
```jsx
<MiniDataTable
  title="Top Clients"
  headers={['Login', 'Name', 'Balance']}
  rows={[[101, 'John', '$1,000'], [102, 'Jane', '$2,000']]}
  onViewAll={() => navigate('/clients')}
/>
```

### ChartWidget
Lightweight SVG-based chart component for data visualization.

**Props:**
- `title` - Chart title
- `type` - 'line' | 'bar' | 'donut'
- `data` - Array of `{label, value}` objects
- `height` - Chart height in pixels
- `loading` - Loading state
- `color` - Chart color theme

**Usage:**
```jsx
<ChartWidget
  title="Daily P&L"
  type="line"
  data={[
    {label: 'Mon', value: 1000},
    {label: 'Tue', value: 1500}
  ]}
  height={200}
/>
```

## Features

- ✅ **Real-time data** - Connected to DataContext with WebSocket updates
- ✅ **Responsive design** - Mobile-first, adapts to all screen sizes
- ✅ **Performance optimized** - Memoized components, efficient re-renders
- ✅ **Loading states** - Skeleton screens during data fetch
- ✅ **Interactive** - Hover effects, click actions, navigation
- ✅ **Accessible** - Semantic HTML, ARIA labels where needed

## Dashboard Metrics

The dashboard displays:

1. **Key Metrics (Top Row)**
   - Total Clients
   - Total Balance
   - Total Equity
   - Open Positions

2. **P&L Overview (Second Row)**
   - Daily P&L
   - Weekly P&L
   - Monthly P&L
   - Lifetime P&L

3. **Quick Actions**
   - View Clients
   - View Positions
   - Pending Orders
   - Live Dealing

4. **Data Tables**
   - Top Profitable Clients
   - Largest Open Positions

5. **System Status**
   - WebSocket Connection
   - Client Count
   - Position Count
   - Order Count

## Data Flow

```
DataContext → DashboardPage → Dashboard Components
     ↓
  WebSocket
  (real-time)
```

All metrics update automatically via WebSocket connection.
