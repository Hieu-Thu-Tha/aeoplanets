# AEOSTARS Design Guidelines

## Design Approach

**System-Based:** Material Design with Linear-inspired minimalism for enterprise analytics. Prioritizes information density, scanability, and efficient workflows over decorative elements. Design emphasizes data clarity, rapid comprehension, and productive interactions.

**Core Principles:**
- Information hierarchy over visual embellishment
- Consistent, predictable patterns
- Data-first layouts
- Professional trustworthiness

---

## Typography System

**Font Families:**
- **Primary Interface:** Inter (Google Fonts) - UI, labels, body text, headings
- **Technical/Data:** JetBrains Mono - metrics, JSON-LD, IDs, code blocks, timestamps

**Type Scale:**
- Dashboard Headers: `text-2xl font-semibold` (24px)
- Section Titles: `text-lg font-semibold` (18px)
- Metric Labels: `text-sm font-medium uppercase tracking-wide`
- Primary Metric Values: `text-3xl font-bold` (30px)
- Body Text: `text-base` (16px)
- Table Data: `text-sm` (14px)
- Technical Data: `text-xs font-mono` (12px)

**Hierarchy Rules:**
- Tighter tracking (-0.02em) on large headings for impact
- Semibold (600) for emphasis, regular (400) for body
- Uppercase + wide tracking for labels creates clear separation

---

## Layout System

**Spacing Primitives:** Tailwind units of **2, 4, 6, 8**
- `p-2/m-2`: Compact elements (badges, tight cards)
- `p-4/m-4`: Standard component padding
- `p-6/m-6`: Section spacing, card interiors
- `p-8/m-8`: Page containers, major sections

**Grid Architecture:**
- **App Shell:** Fixed sidebar `w-64` + fluid main content
- **Dashboard Grids:** `grid-cols-12` for flexible metric layouts
- **Comparison Views:** `grid-cols-2` or `grid-cols-3` for side-by-side analysis
- **Data Tables:** Full-width with horizontal scroll on dense columns

**Container Widths:**
- Dashboard content: `max-w-full px-8`
- Settings/forms: `max-w-5xl mx-auto`
- Modals: `max-w-2xl`

---

## Component Library

### Application Shell

**Sidebar Navigation:**
- Fixed left panel (260px, `h-screen`)
- Logo area at top (`h-16`)
- Collapsible module groups (Monitoring, Products, Admin)
- Active state: left border accent (4px)
- Icon (`w-5 h-5`) + label per item
- User profile section at bottom with avatar and dropdown

**Top Bar:**
- Account switcher (multi-tenant dropdown)
- Global search trigger (⌘K shortcut)
- Notification bell with unread badge
- User avatar menu (right-aligned)

### Dashboard Components

**Metric Cards:**
- Minimum `h-32`, consistent padding `p-6`
- Large value display (`text-3xl font-bold`)
- Label above value (`text-sm uppercase tracking-wide`)
- Trend indicator (arrow icon + percentage)
- Comparison text (`text-xs`, "vs. last week")
- Optional sparkline chart (`h-12`)

**Engine Status Grid:**
- 3-column layout (`grid-cols-3 gap-4`)
- Each card: engine logo + inclusion rate + delta
- Status icon (checkmark/x based on threshold)
- Hover state reveals additional metrics

**Comparison Tables:**
- Fixed header with `sticky top-0`
- Sortable columns (arrow indicators in header)
- Alternating row treatment for scanability
- Expandable rows for citation details
- Highlight on hover

**Citation Network Graph:**
- Visualization canvas (`min-h-96`)
- Domain nodes with connecting lines
- Interactive hover states (URL + citation count)
- Zoom/pan controls in corner

### Forms & Inputs

**Standard Inputs:**
- Consistent `h-10` for text fields
- Labels: `text-sm font-medium mb-1`
- Validation states with helper text below
- Multi-select dropdowns for competitor tracking

**Button Groups:**
- LLM selector: horizontal toggle group
- Filled state for active, outlined for inactive
- Icon + label for clarity

**File Upload:**
- Drag-and-drop zone with dashed border
- Progress bar during processing
- Clear success/error states

### Data Display

**Product Feed Tables:**
- Pagination or infinite scroll
- Inline editing capabilities
- Column filters (dropdown per header)
- Bulk action toolbar on selection
- Product thumbnail (`w-12 h-12 object-cover`) + SKU + title + price + stock

**Recommendation Queue:**
- Card-based list with priority badges
- Impact/effort visualization option
- Action dropdown per item
- Expandable detail panel showing before/after

**JSON-LD Preview:**
- Code editor component with syntax highlighting
- Copy-to-clipboard button (top-right)
- Validation indicator (checkmark or warning icon)
- Line numbers in gutter

### Modals & Overlays

**Dialog Modals:**
- Backdrop with blur effect
- Centered panel (`max-w-2xl`)
- Header with title + close button (X)
- Scrollable body (`max-h-[70vh]`)
- Footer with Cancel + Primary action buttons

**Slide-out Panels:**
- Right-edge drawer (`w-96`)
- Prompt configuration library
- Scrollable content area
- Variable insertion UI

**Toast Notifications:**
- Top-right positioning
- Auto-dismiss (5s) or manual close
- Types: success, warning, error, info
- Icon + message + close button

### Admin Components

**User Management:**
- Search/filter bar at top
- Table columns: Name, Email, Role, Status, Last Active, Actions
- Role badges (visual differentiation)
- Inline edit or modal for details
- Bulk invite functionality

**Settings Layouts:**
- Tab navigation for categories
- Form sections with clear headings (`text-lg font-semibold mb-4`)
- Save confirmation banner when changes pending

---

## Data Visualization

**Charts (Recharts library):**
- Line charts: inclusion trends over time (`h-64`)
- Bar charts: competitor comparison
- Donut charts: engine distribution breakdown
- Area charts: visibility score progression

**Chart Styling:**
- Grid lines: subtle horizontal only
- Axis labels: `text-xs`
- Interactive tooltips on hover
- Togglable legend
- Responsive heights (`h-64` to `h-80`)

---

## Responsive Behavior

**Breakpoints:**
- Mobile: Single column, hamburger menu for sidebar
- Tablet (`md:`): 2-column grids, sidebar persists
- Desktop (`lg:+`): Full multi-column layouts

**Mobile Adaptations:**
- Metric cards stack vertically
- Tables: horizontal scroll with sticky first column
- Navigation: slide-out drawer

---

## Iconography

**Library:** Lucide React (CDN)
- Navigation: Home, BarChart, Users, Settings, Package, FileText
- Status: CheckCircle, AlertTriangle, XCircle, TrendingUp, TrendingDown
- Actions: Plus, Edit, Trash, Download, Upload, Copy, ExternalLink
- Sizes: `w-5 h-5` for UI, `w-4 h-4` inline

---

## Animations

**Minimal Motion:**
- Hover transitions: 150ms ease
- Tab switching: crossfade 200ms
- Modal entry/exit: scale + fade 250ms
- Loading: skeleton screens or subtle pulse
- Respect `prefers-reduced-motion`

---

## Images

**No Hero Images** - Dashboard application focused on data visualization and functional UI.

**Product Thumbnails:**
- Square aspect ratio (`aspect-square object-cover`)
- Placeholder icon for missing images

**Engine Logos:**
- Brand logos (`w-8 h-8`) for OpenAI, Anthropic, Google, Perplexity
- Monochrome treatment when inactive

---

## Accessibility

**Keyboard Navigation:**
- Tab reaches all interactive elements
- Skip-to-content link
- Escape closes modals/dropdowns
- Arrow keys navigate tables

**Focus States:**
- Visible ring (`ring-2 ring-offset-2`)
- High contrast indicators

**Screen Readers:**
- Semantic HTML (`nav`, `main`, `article`)
- ARIA labels for icon-only buttons
- Live regions for dynamic updates
- Proper table header associations

---

## Key Page Layouts

**Dashboard:**
- 6 metric cards (`grid-cols-3 gap-4`, 2 rows)
- Full-width visibility trend chart
- Recent alerts table below

**Multi-Engine Monitor:**
- Engine tabs at top
- Split view: prompt library (left) + answer preview (right)
- Citation list below answer
- Compare mode: 2-3 side-by-side panels

**Product Feed Manager:**
- Left sidebar: feed status, sync info
- Main area: searchable product table with filters
- Bulk actions toolbar
- Slide-in panel for product editing

**Recommendations:**
- Priority queue list view
- Kanban board alternative
- Impact/effort filters
- Modal for detailed fix instructions

**Admin Panel:**
- Tab navigation: General, Users, Integrations, Billing
- User management table with roles
- Activity audit log

---

**Design Confidence:** This system delivers a professional, data-dense environment optimized for analytical workflows with clarity and efficiency at scale.