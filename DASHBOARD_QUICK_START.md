# Dashboard Quick Start Guide

## 🚀 Accessing the Dashboard

The dashboard is now your default home page. You'll see it when you:
1. Log in to the application
2. Navigate to `/` or `/dashboard`
3. Click the "Dashboard" item in the sidebar

## 📊 Understanding Your Dashboard

### Real-Time Data
Everything you see updates **automatically** via WebSocket:
- Client balances change instantly
- Position profits update in real-time
- New orders appear immediately
- P&L metrics refresh continuously

### Key Sections

#### 1. **Key Metrics** (Top Row)
Your most important numbers at a glance:
- **Total Clients**: How many active accounts
- **Total Balance**: Sum of all client balances  
- **Total Equity**: Current portfolio value
- **Open Positions**: Active trading positions

💡 **Tip**: Numbers turn green (profit) or red (loss) automatically

#### 2. **P&L Overview** (Second Row)
Track performance over different time periods:
- **Daily P&L**: Today's profit/loss
- **Weekly P&L**: This week's performance
- **Monthly P&L**: Current month results
- **Lifetime P&L**: All-time profits

💡 **Tip**: Use these to spot trends and patterns

#### 3. **Quick Actions** (Third Row)
One-click access to key features:
- **View Clients**: Full client management
- **View Positions**: All open trades
- **Pending Orders**: Orders awaiting execution (shows count)
- **Live Dealing**: Real-time trading activity

💡 **Tip**: Click any card to jump directly to that page

#### 4. **Top Lists** (Two Tables)
See who's performing best:
- **Top Profitable Clients**: Your most successful traders
- **Largest Positions**: Biggest open trades by profit

💡 **Tip**: Click "View All" to see complete lists

#### 5. **System Status** (Bottom)
Monitor system health:
- **WebSocket**: Connection status (🟢 Connected / 🔴 Disconnected)
- **Clients**: Total active accounts
- **Positions**: Number of open trades
- **Orders**: Pending order count

💡 **Tip**: If WebSocket is disconnected, refresh the page

## 🎯 Common Tasks

### Check Overall Performance
1. Look at **Key Metrics** for current snapshot
2. Review **P&L Overview** for trends
3. Check **Top Profitable Clients** for winners

### Monitor Real-Time Activity
1. Watch **Open Positions** count
2. Check **System Status** for WebSocket (must be green)
3. Visit **Live Dealing** page for minute-by-minute updates

### Quick Navigation
1. Use **Quick Actions** cards to jump to any section
2. Click **View All** in tables for full data
3. Use sidebar menu for all features

## ⚠️ Troubleshooting

### Dashboard shows "Loading..."
- **Reason**: Fetching data from server
- **Solution**: Wait a few seconds, data will appear

### Numbers aren't updating
- **Reason**: WebSocket disconnected
- **Solution**: Check **System Status** - if red, refresh page

### Empty state messages
- **Reason**: No data available yet
- **Solution**: Ensure MT5 server is running and connected

## 🎨 Visual Cues

### Colors
- **Green** 🟢: Positive values, profits, connected
- **Red** 🔴: Negative values, losses, disconnected  
- **Blue** 🔵: Neutral, informational
- **Gray** ⚪: Pending, awaiting data

### Animations
- **Scale on hover**: Clickable elements
- **Pulse**: Loading states
- **Shadow increase**: Interactive elements

## 📱 Mobile & Tablet

The dashboard is fully responsive:
- **Mobile**: Cards stack vertically for easy scrolling
- **Tablet**: 2-column grid for balanced view
- **Desktop**: 4-column grid for maximum information

💡 **Tip**: Use landscape mode on mobile for better table viewing

## 🔄 Data Refresh

### Automatic Updates
- Position P&L: Every second
- Client balances: On every trade
- Order status: Instantly
- Statistics: Continuous

### Manual Refresh
- Not needed! WebSocket keeps everything current
- If connection drops, page reload reconnects

## 💡 Pro Tips

1. **Bookmark the dashboard** for quick access
2. **Watch the P&L cards** to spot unusual activity
3. **Check Top Clients** to identify VIP accounts
4. **Monitor WebSocket status** - green = healthy
5. **Use Quick Actions** for fast navigation
6. **Let it run** - data updates automatically

## 🆘 Need Help?

**Dashboard not loading?**
- Check your internet connection
- Verify you're logged in
- Try refreshing the page

**Numbers seem wrong?**
- Ensure MT5 server is connected
- Check WebSocket status (should be green)
- Wait a few seconds for data to sync

**Want more details?**
- Click any Quick Action card
- Click "View All" in tables
- Use sidebar menu for full features

---

**Your dashboard is your command center - everything you need at a glance!** 🎯

For technical documentation, see:
- `DASHBOARD_IMPLEMENTATION.md` - Technical details
- `DASHBOARD_VISUAL_GUIDE.md` - Visual reference
- `src/components/dashboard/README.md` - Component docs
