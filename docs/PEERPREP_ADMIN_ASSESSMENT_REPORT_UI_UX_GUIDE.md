# PeerPrep Admin Assessment Report UI/UX Guide

Document purpose: This guide documents the PeerPrep-style user interface and user experience pattern for the **admin assessment report page only**. It is intended for designing a new standalone platform whose report functionality may be different, while keeping the same visual theme, layout structure, control placement, and interaction feel.

Scope: Admin-side assessment reports, coordinator-compatible report pages, left navigation shell, report header, report tabs, assessment selector rail, filters, KPI cards, analytics panels, candidate table, export modal, student detail drawer, violation modal, loading states, empty states, and responsive behavior.

This document is UI/UX focused. It does not define backend report calculations.

---

## 1. Page Identity

The admin report page should feel like an operational analytics workspace, not a marketing dashboard.

Primary user goals:

- Quickly understand assessment performance.
- Switch between all assessments and a single assessment.
- Inspect candidate performance.
- Find risky or flagged sessions.
- Filter records.
- Export report data.
- Open detailed candidate and proctoring evidence views.

Visual personality:

- Clean, compact, data-heavy.
- Light blue and slate PeerPrep theme.
- White card surfaces on a very pale blue page background.
- Rounded but controlled corners.
- Small typography for dense report controls.
- Icons in almost every navigation and action control.
- Dashboard-style panels with clear borders and subtle shadows.

Recommended page title:

```text
Assessment Reports
```

Recommended route:

```text
/admin/assessment/reports
```

Coordinator route can reuse the same UI:

```text
/coordinator/assessment/reports
```

---

## 2. Global Admin Shell

The report page sits inside the standard admin shell.

### 2.1 Top Navbar

Position:

- Fixed at the top.
- Full width.
- Height: `5rem` or `80px`.
- Z-index above sidebar and page content.

Structure:

- Left: PeerPrep logo.
- Right: admin profile pill.
- Profile pill contains avatar or initials, admin name on wider screens, and a chevron.
- Profile dropdown opens below the pill, aligned to the right.

Navbar visual style:

```text
background: white
border-bottom: slate/gray thin border
dark mode: gray-900 background
```

Typical navbar classes:

```text
fixed top-0 left-0 right-0 z-50
border-b border-gray-200 bg-white
dark:border-gray-700 dark:bg-gray-900
```

### 2.2 Left Global Sidebar

Position:

- Fixed left.
- Starts below the navbar.
- Height is viewport minus navbar height.
- Collapsed by default.
- Expands on hover.

Collapsed width:

```text
4rem
```

Expanded width:

```text
14rem
```

Placement:

```text
left: 0
top: var(--app-navbar-height, 5rem)
height: calc(100vh - var(--app-navbar-height, 5rem))
```

Content padding:

```text
px-2 py-3
```

Sidebar style:

```text
border-r border-slate-200
bg-white/95
shadow-sm
backdrop-blur
dark:border-gray-700
dark:bg-gray-900/95
```

Interaction:

- Hovering the sidebar expands it.
- Mouse leave collapses it.
- Icon buttons remain visible when collapsed.
- Text labels fade and slide in when expanded.
- Active route uses sky-tinted background and text.

Assessment navigation group:

```text
Assessment
  Overview
  Add Assessment
  Reports
```

The `Reports` child is active for the report page.

Active nav item:

```text
bg-sky-50 text-sky-700
dark:bg-sky-900/30 dark:text-sky-300
```

Inactive nav item:

```text
text-slate-600 hover:bg-slate-50 hover:text-slate-900
dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100
```

### 2.3 Content Offset

The main route content must be padded by the current sidebar width.

```text
padding-left: var(--admin-sidebar-width)
transition: padding 300ms
```

This keeps the report page from sitting underneath the sidebar.

---

## 3. Report Page Canvas

The assessment report page itself uses a viewport-locked layout.

Outer page:

```text
h-screen
overflow-hidden
bg-[#f5fbff]
text-slate-900
dark:bg-gray-950
```

Meaning:

- The whole report workspace is one screen-height shell.
- Header and tabs stay at the top of the page area.
- The report content area scrolls internally.
- The global browser page should not become the primary scroll container.

Max content width:

```text
max-w-[1600px]
```

Horizontal page padding:

```text
px-4 on mobile and default
sm:px-6 on wider screens
```

---

## 4. Report Header

The report page has its own sticky-looking top band below the global navbar.

Header surface:

```text
border-b border-sky-100
bg-white/95
shadow-sm shadow-sky-950/5
backdrop-blur
dark:border-gray-800
dark:bg-gray-900/95
```

Header layout:

- Max width container.
- Flex row on desktop.
- Left: icon + title block.
- Right: search, selected assessment indicator, reset, filters, export.
- Wrap controls if space is limited.

Header padding:

```text
px-4 py-3
sm:px-6
```

### 4.1 Title Block

Left side:

- Square icon tile.
- Title.
- Small subtitle with current record counts.

Icon tile:

```text
h-10 w-10
rounded-xl
bg-sky-600
text-white
shadow-sm shadow-sky-200
```

Title:

```text
text-lg font-semibold text-slate-950
dark:text-white
```

Subtitle:

```text
text-xs text-slate-500
dark:text-gray-400
```

Example subtitle:

```text
48 candidate records across 6 assessments
```

### 4.2 Header Controls

Controls sit on the right.

Recommended order:

1. Search field.
2. Selected assessment pill, when an assessment is selected.
3. Reset button.
4. Filters button.
5. Export button or export settings button.

Search field:

- Height: `2.25rem` or `h-9`.
- Width: about `16rem` on desktop.
- Left search icon.
- Rounded-lg.
- Border slate.
- Focus ring sky.

Selected assessment indicator:

- Small pill.
- Shows current assessment title.
- Truncates long title.
- Provides an `X` button or reset action nearby.

Filter button:

- Icon: `SlidersHorizontal`.
- Height: `h-9`.
- Border button by default.
- Sky-tinted when filters are open or active.
- Shows small circular count badge when filters are active.

Export button:

- Icon: `Download` or `FileSpreadsheet`.
- Lime-tinted for Excel/export action.
- Keep it visually secondary to filters but still obvious.

Button base style:

```text
inline-flex h-9 items-center gap-1.5
rounded-lg border px-3
text-xs font-semibold
transition-colors
```

Primary active sky button:

```text
border-sky-200 bg-sky-50 text-sky-700
dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300
```

Neutral button:

```text
border-slate-200 bg-white text-slate-600 hover:bg-slate-50
dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700
```

Export button:

```text
border-lime-200 bg-lime-50 text-lime-700 hover:bg-lime-100
dark:border-lime-800 dark:bg-lime-900/20 dark:text-lime-300
```

---

## 5. Primary Report Tabs

The report page uses a horizontal tab bar directly under the report header.

Tabs:

```text
Overview
Candidates
Analytics
Violations
```

Icons:

- Overview: `LayoutDashboard`
- Candidates: `GraduationCap`
- Analytics: `BarChart3`
- Violations: `ShieldAlert`

Tab bar surface:

```text
border-t border-slate-200
bg-slate-50
dark:border-gray-700
dark:bg-gray-800
```

Tab container:

```text
flex gap-1
```

Tab button:

```text
relative flex items-center gap-1.5
border-b-2 px-3 py-3
text-xs font-semibold
transition-colors
```

Active tab:

```text
border-sky-600 text-sky-700
dark:border-sky-400 dark:text-sky-300
```

Inactive tab:

```text
border-transparent
text-slate-500 hover:text-slate-700
dark:text-gray-400 dark:hover:text-gray-300
```

Violations tab badge:

- Show only when violation count is greater than zero.
- Small rounded count bubble.
- Sky background, white text.

Badge style:

```text
ml-0.5 flex h-4 min-w-[16px] items-center justify-center
rounded-full bg-sky-600 px-1
text-[9px] font-bold text-white
```

---

## 6. Main Two-Column Workspace

Below the tab bar, the page becomes a two-column report workspace.

Desktop grid:

```text
mx-auto grid h-[calc(100vh-113px)] max-w-[1600px]
grid-cols-1 gap-4 overflow-hidden px-4 py-4 sm:px-6
lg:grid-cols-[310px_minmax(0,1fr)]
```

Left column:

- Assessment selector rail.
- Hidden on smaller screens.
- Width: `310px`.

Right column:

- Main report panels and table.
- Scrolls vertically.

Main scroll area:

```text
min-h-0 overflow-y-auto pr-1
```

Important layout principle:

- The left rail and right content are inside the fixed-height page workspace.
- Do not let the whole browser page scroll behind the report shell.

---

## 7. Assessment Selector Rail

The assessment rail is a local report sidebar inside the page, separate from the global admin sidebar.

Purpose:

- Filter by assessment window.
- Search assessments.
- Pick one assessment to scope the report.
- See quick attempt and score signals.

Desktop placement:

- Left side of the report workspace.
- Sticky inside the report page.
- Hidden below `lg`.

Rail surface:

```text
sticky top-[136px]
max-h-[calc(100vh-160px)]
overflow-y-auto
rounded-2xl
border border-slate-200/80
bg-white/90
p-4
shadow-lg shadow-slate-200/50
backdrop-blur-sm
dark:border-gray-700/80
dark:bg-gray-900/90
dark:shadow-gray-900/50
```

### 7.1 Rail Header

Header row:

- Left: gradient icon tile and label `Assessments`.
- Right: count badge.

Icon tile:

```text
h-7 w-7 rounded-lg
bg-gradient-to-br from-sky-500 to-blue-600
text-white
```

Count badge:

```text
rounded-full bg-slate-100 px-2 py-0.5
text-[10px] font-semibold text-slate-600
dark:bg-gray-800 dark:text-gray-400
```

### 7.2 Window Filter Buttons

Assessment windows:

- All
- Upcoming
- Live
- Completed

Each button:

- Icon + label on left.
- Count on right.
- Rounded-xl.
- Border.
- Text-xs bold.

Active window:

```text
border-sky-200 bg-sky-50 text-sky-800 shadow-sm shadow-sky-100
dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200
```

Inactive window:

```text
border-transparent bg-slate-50/70 text-slate-600
hover:border-slate-200 hover:bg-white hover:text-slate-900
dark:bg-gray-800/70 dark:text-gray-300
dark:hover:border-gray-700 dark:hover:bg-gray-800
```

### 7.3 Rail Search

Search input:

- Full width.
- Height: `h-9`.
- Search icon absolute left.
- Rounded-lg.
- Slate border.
- Sky focus.

Use placeholder:

```text
Search assessments
```

### 7.4 Schedule Filters

Optional collapsible section.

Controls:

- Start/from date.
- End/to date.
- DateTimePicker or native date controls.

Collapsed header style:

```text
mb-2 flex w-full items-center justify-between rounded-lg px-1
text-[11px] font-bold uppercase tracking-wider text-slate-400
```

Chevron rotates when collapsed.

### 7.5 Assessment List Cards

Each assessment list item is a button.

Card style:

```text
w-full rounded-xl border p-3 text-left transition-colors
```

Active assessment:

```text
border-sky-300 bg-sky-50 text-sky-950 ring-1 ring-sky-100
dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-100 dark:ring-sky-900
```

Inactive assessment:

```text
border-slate-200 bg-white text-slate-700
hover:border-sky-200 hover:bg-sky-50/50
dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-sky-800
```

Inside each card:

- Top row: assessment title, status badge.
- Meta row: assessment type, created date, or schedule.
- Bottom row: submissions, score, violations or completion signal.
- Hover can reveal a small `View report` affordance.

Long titles must truncate.

### 7.6 Mobile Rail Replacement

On mobile and tablet:

- Hide desktop rail.
- Show a compact collapsible filter card above main content.
- First row shows active window and count.
- Expanding shows the same window buttons.

Mobile card style:

```text
mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm
dark:border-gray-800 dark:bg-gray-900
```

---

## 8. KPI Cards

KPI cards appear on `Overview` and `Analytics`.

Grid:

```text
mb-6 grid gap-4
sm:grid-cols-2
lg:grid-cols-3
xl:grid-cols-6
```

Card style:

```text
group relative flex flex-col
rounded-2xl
border border-slate-200
bg-white
p-5
shadow-sm
transition-shadow
hover:shadow-md
dark:border-gray-700
dark:bg-gray-900
```

Card structure:

1. Top row: icon tile and optional trend badge.
2. Value.
3. Label.
4. Optional subtext or insight.
5. Optional sparkline.

Icon tile:

```text
h-10 w-10 rounded-xl
```

Use sky or lime tones:

```text
sky: bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300
lime: bg-lime-50 text-lime-700 dark:bg-lime-900/20 dark:text-lime-300
```

Value:

```text
truncate text-2xl font-bold tracking-tight text-slate-900
dark:text-white
```

Label:

```text
mt-0.5 text-xs font-medium text-slate-500
dark:text-gray-400
```

Common KPI set:

- Total Assessments
- Total Attempts
- Average Score
- Completion Rate
- Average Time
- Violations

Violations tab KPI set:

- Total Violations
- Tab Switches
- Fullscreen Exits
- Camera Flags
- Unique Candidates

---

## 9. Analytics Cards

Analytics cards use the same base surface:

```text
rounded-2xl border border-slate-200 bg-white p-5 shadow-sm
dark:border-gray-700 dark:bg-gray-900
```

Panel heading:

```text
flex items-center gap-2
text-sm font-bold text-slate-900
dark:text-white
```

Panel micro-label:

```text
text-[10px] text-slate-400
dark:text-gray-500
```

### 9.1 Overview Charts Row

Grid:

```text
mb-6 grid gap-4 lg:grid-cols-3
```

Panels:

1. Score Distribution
2. Attempt or performance trend
3. Violation / status breakdown

### 9.2 Activity Row

Grid:

```text
mb-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr_1fr]
```

Panels:

- Real-time Activity
- Completion Outcome
- Integrity or risk summary

### 9.3 Analytics Tab Extra Panels

The Analytics tab includes additional operational panels:

- Yearly assessment creation calendar.
- Monthly assessment bars.
- Assessment Health Matrix.

Yearly calendar card:

```text
relative min-w-0 overflow-hidden
rounded-3xl border border-slate-200 bg-white
p-4 shadow-sm
dark:border-gray-700 dark:bg-gray-900
sm:p-5
```

Calendar day cells:

```text
h-3 w-3 rounded-[4px]
hover:scale-125 hover:ring-2 hover:ring-sky-500
```

The calendar can show a floating detail panel when a day is hovered or pinned.

Health Matrix panel:

- Use a rounded-2xl card.
- Use dense rows or heatmap cells.
- Show attempts, completion, violations, score, questions, duration, and peak score.

### 9.4 Violations Tab Charts

Violations tab begins with violation-specific charts:

Grid:

```text
mb-6 grid gap-4 lg:grid-cols-3
```

Panels:

- Violation Types
- Violation Trend
- Risk or flagged candidate summary

Then the table title changes from `Candidate Performance` to:

```text
Flagged Sessions
```

---

## 10. Advanced Filter Panel

The advanced filter panel appears below charts/header controls when the filter button is active.

Panel style:

```text
mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm
dark:border-gray-700 dark:bg-gray-900
```

Panel header:

- Left: `Filter` icon and `Advanced Filters`.
- Right: `Reset all` link button.

Header label:

```text
flex items-center gap-2
text-xs font-semibold uppercase tracking-wider
text-slate-500 dark:text-gray-500
```

Fields grid:

```text
grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6
```

Field types:

- Assessment type select.
- Candidate status select.
- Difficulty select.
- Department input/select.
- Created by input/select.
- Date range from/to.
- Score min/max.
- Completion min/max.
- Attempts min/max.
- Student search query.

Input/select style:

```text
h-9 rounded-lg border border-slate-200 bg-white px-2.5
text-xs text-slate-700 outline-none
focus:border-sky-400
dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200
```

### 10.1 Active Filter Chips

Active chips appear below the filter panel or above main content.

Chip style:

```text
inline-flex items-center gap-1.5
rounded-lg border border-sky-200 bg-sky-50
px-2.5 py-1
text-[11px] font-medium text-sky-700
dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300
```

Chip close button:

```text
rounded-sm p-0.5
hover:bg-sky-100
dark:hover:bg-sky-800
```

Also include a `Clear all` text button.

### 10.2 Saved Filters

If implementing saved filters:

- Show saved filter chips in the filter panel.
- Use a small input for naming current filters.
- Save button uses sky-tinted outline style.
- Store preferences client-side unless platform requires server persistence.

---

## 11. Candidate Performance Table

The report table is the main work surface for candidate-level records.

Outer table card:

```text
rounded-2xl border border-slate-200 bg-white shadow-sm
dark:border-gray-700 dark:bg-gray-900
```

Table card header:

```text
flex flex-wrap items-center justify-between gap-3
border-b border-slate-200 px-4 py-3
dark:border-gray-700
```

Left header:

- Icon: `GraduationCap`.
- Title: `Candidate Performance` or `Flagged Sessions`.
- Optional selected assessment title in muted text.

Right header controls:

1. Export settings button.
2. Columns dropdown button.
3. Page size select.

### 11.1 Table Columns

Recommended default columns:

- Row number
- Candidate
- Attempted
- Tries
- Score
- Accuracy
- Time
- Flags
- Status
- Rank
- Actions

Column visibility dropdown can toggle:

- Candidate
- Attempt date
- Attempts
- Score
- Accuracy
- Time
- Violations/flags
- Status
- Rank

### 11.2 Table Header

Table header style:

```text
bg-slate-50
text-[11px] font-semibold uppercase tracking-wider text-slate-500
dark:bg-gray-800 dark:text-gray-400
```

Sortable header:

```text
cursor-pointer select-none whitespace-nowrap px-4 py-3
transition-colors hover:text-sky-600
dark:hover:text-sky-400
```

Show chevron up/down only for the active sort.

### 11.3 Table Body

Body divider:

```text
divide-y divide-slate-100
dark:divide-gray-800
```

Row style:

```text
group cursor-pointer
text-slate-700
transition-colors
hover:bg-sky-50/40
dark:text-slate-200
dark:hover:bg-sky-900/10
```

Cell padding:

```text
px-4 py-3
```

Candidate cell:

- Avatar or initials tile.
- Candidate name.
- Student ID or email in muted text.
- Truncate long values.

Status:

- Use rounded pill badge.
- Include a small icon where possible.

Flags:

- Use count badge.
- Use rose/safety color when non-zero.
- Clicking should open the violation modal or stop row propagation and open the violation report.

Actions:

- Keep right aligned.
- Prefer icon buttons or concise buttons:
  - View
  - Violations
  - Export row if needed

### 11.4 Pagination

Footer style:

```text
flex flex-wrap items-center justify-between gap-3
border-t border-slate-200 px-4 py-3
dark:border-gray-700
```

Left:

```text
Showing 50 of 220 results
```

Right:

- Prev button.
- Numbered page buttons, maximum about seven visible.
- Next button.

Active page:

```text
bg-sky-600 text-white shadow-sm
```

Inactive page:

```text
border border-slate-200 bg-white text-slate-600 hover:bg-slate-50
dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700
```

---

## 12. Export Settings Modal

Use a centered modal for export configuration.

Overlay:

```text
fixed inset-0 z-[85]
flex items-center justify-center
bg-slate-950/45
px-4 py-6
backdrop-blur-sm
```

Modal panel:

```text
w-full max-w-3xl
rounded-2xl
border border-slate-200
bg-white
shadow-2xl
dark:border-gray-700
dark:bg-gray-900
```

Header:

```text
flex items-start justify-between gap-4
border-b border-slate-200 px-5 py-4
dark:border-gray-700
```

Title:

```text
text-lg font-bold text-slate-900
dark:text-white
```

Body:

- Top row buttons:
  - Select All
  - Unselect All
  - Save Preferred Export Settings
- Column checkbox grid.

Checkbox grid:

```text
grid max-h-[420px] gap-2 overflow-y-auto
rounded-xl border border-slate-200 p-3
sm:grid-cols-2 lg:grid-cols-3
dark:border-gray-700
```

Footer:

- Left: selected column count.
- Right: Cancel, PDF, CSV, Download Excel.

Primary export button:

```text
inline-flex items-center gap-1
rounded-lg bg-lime-600 px-4 py-2
text-xs font-semibold text-white
hover:bg-lime-500
disabled:opacity-60
```

---

## 13. Student Detail Drawer

Candidate details open in a right-side drawer.

Use case:

- Admin clicks a candidate row.
- Drawer shows score, time, section breakdown, question performance, security summary, and AI proctoring summary.

Overlay and drawer wrapper:

```text
fixed inset-0 z-[80] flex justify-end
```

Backdrop:

```text
absolute inset-0 bg-slate-950/40 backdrop-blur-sm
```

Drawer panel:

```text
relative flex h-full w-full max-w-xl flex-col
border-l border-slate-200 bg-white shadow-2xl
dark:border-gray-700 dark:bg-gray-900
sm:max-w-2xl
```

### 13.1 Drawer Header

Header:

```text
flex items-start justify-between
border-b border-slate-200 px-6 py-5
dark:border-gray-700
```

Left:

- Initials avatar.
- Candidate name.
- Student ID and attempt date.

Avatar:

```text
h-12 w-12 rounded-xl
bg-sky-100 text-sky-700
dark:bg-sky-900/30 dark:text-sky-300
```

Right:

- Violation button if candidate has violations.
- Close icon button.

Violation button:

```text
rounded-lg border border-rose-200 bg-rose-50
px-2.5 py-1.5
text-[11px] font-bold text-rose-700
hover:bg-rose-100
dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300
```

### 13.2 Drawer Tabs

Tabs:

```text
Overview
Questions
Security
```

Tab style should match the primary page tab style:

```text
flex items-center gap-1.5 px-4 py-3
text-xs font-semibold border-b-2
```

### 13.3 Drawer Body

Body:

```text
flex-1 overflow-y-auto px-6 py-5
```

Content spacing:

```text
space-y-6
```

Overview content:

- Score card.
- Donut/progress chart.
- Time taken.
- Rank.
- Status.
- Section breakdown accordion.

Questions content:

- Per-question list.
- Correct: lime/emerald tinted.
- Wrong: rose tinted.
- Skipped: slate tinted.
- Coding verdicts can appear as compact badges.

Security content:

- Tab switches.
- Fullscreen exits.
- Camera flags.
- Copy/paste.
- Location if available.
- AI proctoring panel.

Security metric tiles:

```text
grid grid-cols-2 gap-3 sm:grid-cols-4
```

---

## 14. Violation / Proctoring Modal

Use a larger modal for proctoring analytics and violation timeline.

Overlay:

```text
fixed inset-0 z-[90]
flex items-center justify-center
bg-slate-950/55
px-4 py-6
backdrop-blur-sm
```

Modal panel:

```text
flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden
rounded-3xl
border border-slate-200
bg-white
shadow-2xl
dark:border-gray-700
dark:bg-gray-900
```

### 14.1 Modal Header

Violation modal uses a dark gradient header to signal investigation mode.

Header style:

```text
border-b border-slate-200
bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950
px-6 py-5
text-white
dark:border-gray-700
```

Eyebrow pill:

```text
inline-flex items-center gap-2
rounded-full border border-white/15 bg-white/10
px-3 py-1
text-[11px] font-semibold uppercase tracking-[0.22em]
text-sky-100
```

Title:

```text
text-xl font-bold
```

Close button:

```text
rounded-xl border border-white/15 bg-white/10 p-2
text-white hover:bg-white/20
```

### 14.2 Modal Body

Body:

```text
flex-1 overflow-y-auto px-6 py-5
```

Top KPI grid:

```text
grid gap-3 sm:grid-cols-2 lg:grid-cols-4
```

Cards:

- Total Warnings
- Tab Switches
- Camera Flags
- Copy/Paste

Middle grid:

```text
grid gap-4 lg:grid-cols-[1.15fr_0.85fr]
```

Panels:

- Monitoring window.
- Violation heatmap.

Lower grid:

```text
grid gap-4 lg:grid-cols-[0.82fr_1.18fr]
```

Panels:

- Device and permissions.
- Captured location when available.
- Suspicious activity timeline.

Timeline:

- Vertical line.
- Icon tile on the left.
- Event card on the right.
- Use severity coloring.
- Show type, timestamp, message, source.

Timeline container:

```text
max-h-[420px] overflow-y-auto px-5 py-4
```

Timeline line:

```text
before:absolute before:left-4 before:top-2
before:h-[calc(100%-1rem)] before:w-px
before:bg-slate-200
dark:before:bg-gray-700
```

---

## 15. Status, Badges, And Color Semantics

Primary theme colors:

- Page background: `#f5fbff`
- Main brand/action: sky
- Secondary success/action: lime
- Text: slate
- Dark mode surface: gray-900 / gray-950

Recommended semantic colors:

- Sky: primary navigation, active filters, active tabs, neutral analytics.
- Lime: export, success, pass, positive outcomes.
- Rose: serious violations, failed outcomes, wrong answers.
- Amber: pending/review states.
- Slate: neutral, inactive, empty, skipped.

Status badge base:

```text
inline-flex items-center gap-1
rounded-full px-2 py-0.5
text-[10px] font-semibold
```

Candidate statuses:

- Submitted: lime.
- In progress: sky.
- Pending evaluation: amber.
- Violation or flagged: rose.
- Incomplete/expired: slate or rose depending severity.

Assessment statuses:

- Draft: slate.
- Published: lime.
- Archived/completed: sky or slate.

---

## 16. Typography

Use compact dashboard typography.

Recommended family:

```text
Inter, system sans-serif
```

Global body style:

```text
bg-white text-slate-900 dark:bg-gray-950 dark:text-gray-100 font-sans
```

Common text sizes:

- Page title: `text-lg`.
- Card title: `text-sm`.
- Card value: `text-2xl`.
- Table text: `text-xs`.
- Table header: `text-[11px] uppercase`.
- Micro labels: `text-[10px]`.
- Filter chips: `text-[11px]`.

Use `font-semibold`, `font-bold`, and occasional `font-black` for analytics card numbers. Avoid huge hero typography on this page.

Letter spacing:

- Use uppercase tracking for labels only.
- Do not use negative letter spacing.

---

## 17. Spacing And Radius System

Page spacing:

- Header: `px-4 py-3`, `sm:px-6`.
- Workspace: `px-4 py-4`, `sm:px-6`.
- Grid gap: `gap-4`.
- Dense controls: `gap-2` or `gap-3`.

Cards:

- Standard report cards: `rounded-2xl`.
- Big analytics calendar: `rounded-3xl`.
- Buttons and inputs: `rounded-lg`.
- Small tiles: `rounded-xl`.
- Tiny heatmap cells: `rounded-[4px]`.

Even though many report cards use `rounded-2xl`, keep individual repeated data rows, table wrappers, drawers, and modals as the main card surfaces. Avoid nesting decorative cards inside decorative cards unless the nested element is a real metric tile, accordion item, or input group.

---

## 18. Icons

Use Lucide icons consistently.

Common icon mapping:

- Reports / analytics: `BarChart3`
- Dashboard overview: `LayoutDashboard`
- Candidates: `GraduationCap`
- Violations: `ShieldAlert`
- Filters: `SlidersHorizontal` or `Filter`
- Search: `Search`
- Export: `Download`, `FileSpreadsheet`
- Reset: `RotateCcw`
- Save filter: `Save`
- Calendar/date: `Calendar`
- Time: `Clock`, `Timer`
- Assessment layers: `Layers`
- Activity: `Activity`
- Trend: `TrendingUp`
- Close: `X`
- Pagination: `ArrowLeft`, `ArrowRight`

Icon sizes:

- Header tile: `h-5 w-5`.
- Panel title: `h-4 w-4`.
- Button icon: `h-3.5 w-3.5`.
- Tiny button icon: `h-3 w-3`.

---

## 19. Loading States

Use skeletons, not blank content.

Assessment rail skeleton:

```text
h-20 animate-pulse rounded-xl bg-slate-100
dark:bg-gray-800
```

Drawer skeleton:

```text
h-24 animate-pulse rounded-xl bg-slate-100
dark:bg-gray-800
```

Table skeleton:

- Render several placeholder rows.
- Keep table header visible.
- Avoid changing layout height sharply.

Loading copy:

- Keep short.
- Example: `Loading available fields from the selected assessment...`

---

## 20. Empty States

Empty states should be quiet and centered.

Table empty state:

- Icon in a soft rounded square.
- Short title.
- One muted line.

Icon tile:

```text
h-14 w-14 rounded-2xl bg-slate-100
dark:bg-gray-800
```

Empty text:

```text
text-sm font-semibold text-slate-600
text-xs text-slate-400
```

Examples:

```text
No reports found
Try adjusting filters or selecting another assessment.
```

Assessment rail empty:

```text
No assessments found
```

Analytics panel empty:

```text
No assessment data available for this view.
```

---

## 21. Responsive Rules

Desktop:

- Global sidebar is fixed and hover-expandable.
- Report workspace uses two columns:
  - `310px` assessment rail.
  - Flexible main content.
- KPI grid can show six columns at extra-large width.
- Charts use three-column rows where possible.

Tablet:

- Hide the assessment rail.
- Show mobile assessment window selector card.
- KPI grid uses two or three columns.
- Table scrolls horizontally.

Mobile:

- Header controls wrap.
- Search may become full width.
- Tab bar remains horizontal and may scroll if needed.
- Main content is single column.
- Cards stack.
- Table remains horizontally scrollable.
- Drawer becomes full width.
- Export modal uses nearly full width with internal scroll.
- Violation modal uses full width with `max-h-[92vh]`.

Never let text overflow buttons or cards. Truncate assessment titles, candidate names, and email addresses where space is limited.

---

## 22. Interaction Rules

### 22.1 Assessment Selection

When an assessment is selected:

- Update selected assessment ID.
- Highlight the rail card.
- Show selected assessment title in the table header.
- Keep active report tab unless the user action explicitly requests overview.
- Reset pagination to page 1.

### 22.2 Tab Switching

Tab switching should:

- Preserve filters.
- Preserve selected assessment.
- Reset or adjust table query only where the tab meaning changes.
- On `Violations`, automatically apply a flagged-session view.

### 22.3 Filter Changes

Filter changes should:

- Debounce report loading.
- Reset pagination to first page.
- Create removable filter chips.
- Keep the filter button visually active.

### 22.4 Table Row Click

Clicking a row opens the student detail drawer.

Buttons inside the row, such as violation actions, should stop row propagation and open the relevant modal.

### 22.5 Export

Export opens the settings modal first.

The user can:

- Choose columns.
- Save preferred column choices.
- Download Excel.
- Download CSV.
- Print/save PDF.

Export should respect current filters and selected assessment.

---

## 23. Recommended Component Structure

Use a structure like this in the new platform:

```text
AdminAssessmentReportsPage
  AdminReportHeader
    ReportSearch
    SelectedAssessmentPill
    FilterToggleButton
    ExportButton
  ReportTabs
  ReportWorkspace
    AssessmentReportRail
      AssessmentWindowTabs
      AssessmentSearch
      ScheduleFilters
      AssessmentList
    ReportMain
      KpiGrid
      ReportCharts
      AdvancedFilterPanel
      ActiveFilterChips
      AnalyticsExtraPanels
      CandidateReportTable
  ExportSettingsModal
  CandidateDetailDrawer
  ViolationAnalyticsModal
```

Supporting primitives:

```text
KpiCard
StatusBadge
TrendBadge
FilterChip
SortHeader
TableRow
TableEmpty
SkeletonRow
AssessmentListItem
MetricTile
DrawerTabs
ModalShell
```

---

## 24. Implementation Checklist

Use this checklist when recreating the PeerPrep-style admin assessment report page:

- Fixed top admin navbar is present.
- Hover-expand left global sidebar is present.
- Assessment group contains Overview, Add Assessment, Reports.
- Page background is pale blue, not plain gray.
- Page has its own report header with title, icon, subtitle, and controls.
- Primary tabs sit directly below the report header.
- Main workspace is viewport-height and internally scrollable.
- Desktop layout has a 310px assessment rail.
- Mobile layout replaces rail with collapsible selector card.
- KPI cards use rounded-2xl white surfaces, slate border, subtle shadow.
- Charts are arranged in dense dashboard grids.
- Advanced filters are hidden until toggled.
- Active filters appear as removable sky chips.
- Candidate table supports sorting, column visibility, pagination, and export.
- Candidate row click opens right drawer.
- Violation action opens large proctoring modal.
- Export opens centered settings modal.
- Loading states use skeletons.
- Empty states are quiet and centered.
- All controls support dark mode.
- Long text truncates safely.
- Icons are used in tabs, buttons, headers, and cards.

---

## 25. What To Keep And What Can Change

Keep from PeerPrep:

- Admin shell structure.
- Sky/slate/lime visual theme.
- Header + tab + workspace layout.
- Left assessment rail.
- KPI and analytics card treatment.
- Dense candidate table.
- Drawer for candidate details.
- Large modal for proctoring or violations.
- Filter chip behavior.
- Export settings modal pattern.

Can change for the new platform:

- Actual report metrics.
- Assessment status model.
- Export field list.
- Proctoring evidence details.
- Candidate identity fields.
- Organization/tenant controls.
- Manual review workflows.
- Result publication workflow.
- Domain names, labels, and route names.

The key is to preserve the PeerPrep reporting rhythm: fixed admin shell, compact analytics workspace, left report scope rail, top tabs, card-based summaries, dense table, and drill-down overlays.
