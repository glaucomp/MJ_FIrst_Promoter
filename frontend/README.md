# TeaseMe Dashboard

A responsive dashboard application for the TeaseMe platform with role-based access control.

## Features

- **Responsive Design**: Mobile-first with sidebar navigation on mobile/tablet and topbar on desktop
- **Role-Based Access**: Three user types with different permissions and views
  - **Admin**: Full system access
  - **Team Manager**: Manage invited users, view performance metrics, can switch to Promoter view
  - **Promoter**: View follower metrics and earnings
- **Dual Backend Integration**: Configured to work with two separate backend services
- **Modern UI**: Built with React, TypeScript, and Tailwind CSS

## User Roles

### Admin
- Full access to all features
- System-wide analytics and reports
- User management capabilities

### Team Manager
- View information from invited users (Models page)
- Track model performance and team earnings
- Access engagement reports
- **Can switch between Team Manager View and Promoter View** in Settings
  - Team Manager View: Shows team metrics (Models, team income, team quick tasks)
  - Promoter View: Shows personal metrics (Followers, promoter income, promoter quick tasks)
- Can access Models page regardless of current view

### Promoter
- View follower count and growth
- Track personal earnings and revenue
- Access to promotional tools
- **Cannot switch views** - only see Promoter view
- Cannot access Models page (team manager only)

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS v4 with Figma design tokens
- **Routing**: React Router v6
- **Build Tool**: Vite
- **State Management**: React Context API
- **Design System**: Integrated directly from Figma variables

## Getting Started

### Prerequisites

- Node.js 16+ and npm

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Update .env with your backend URLs
```

### Development

```bash
npm run dev
```

The application will start at `http://localhost:5173`

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
src/
├── components/         # Reusable UI components
│   ├── Sidebar.tsx    # Mobile/tablet sidebar navigation
│   ├── TopBar.tsx     # Desktop topbar navigation
│   ├── StatCard.tsx   # Statistics display card
│   ├── Chart.tsx      # Chart visualization component
│   └── QuickTaskCard.tsx # Quick action cards
├── contexts/          # React contexts
│   └── AuthContext.tsx # Authentication and user management
├── hooks/             # Custom React hooks
│   └── useMediaQuery.ts # Responsive design hook
├── pages/             # Page components
│   ├── Dashboard.tsx  # Main dashboard view
│   ├── Models.tsx     # Models management
│   ├── Reports.tsx    # Analytics and reports
│   └── Settings.tsx   # User settings and role switching
├── services/          # API services
│   └── api.ts         # Backend integration
├── types/             # TypeScript type definitions
│   └── index.ts
└── App.tsx            # Main application component
```

## Backend Integration

The application is configured to work with two separate backends:

- **Backend 1** (`VITE_BACKEND_1_URL`): Handles user management, models, and team data
- **Backend 2** (`VITE_BACKEND_2_URL`): Handles promoter statistics and analytics

### API Endpoints

#### Backend 1
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/users/invited` - List of invited users
- `GET /api/dashboard/chart` - Chart data

#### Backend 2
- `GET /api/promoter/stats` - Promoter statistics
- `GET /api/promoter/followers` - Follower metrics

## Design

The UI is based on Figma designs with:
- Dark theme optimized for extended use
- Custom color palette with pink accent colors
- Responsive breakpoints: mobile (< 768px), tablet (768px - 1024px), desktop (> 1024px)
- Consistent spacing and elevation system

## Development Notes

- Mock API data is currently used for development
- Replace mock data with actual API calls in `src/services/api.ts`
- Implement proper authentication flow in `AuthContext.tsx`
- Add error handling and loading states as needed
