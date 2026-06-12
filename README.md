# HR Management System - Frontend

Web frontend for the HR Management System developed for **INFINITY CR** and **Celulares Alex CR**.
This application provides a responsive interface for managing administrative HR processes
including employee records, attendance, payroll, leave management, performance evaluations,
and recruitment.

## Features

- **Dashboard**: key indicators (attendance, pending requests, upcoming birthdays)
- **Employee Management**: digital records, personal data, contracts, job positions
- **Attendance**: clock-in/out, schedules, weekly programming, holidays
- **Leave Management**: vacations, absences, sick leave requests and approvals
- **Payroll**: payroll periods, income/deductions, pay receipts
- **Performance Evaluations**: criteria-based evaluations and commissions
- **Recruitment**: candidates, applications, selection pipeline
- **Access Control**: users, roles, and permissions

## Tech Stack

- **Language**: TypeScript
- **Framework**: React (or specify: Next.js / Vue / Angular)
- **Styling**: (e.g. Tailwind CSS)
- **State Management**: (e.g. React Query / Redux)
- **HTTP Client**: (e.g. Axios / Fetch)

## Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/          # Page-level views / routes
├── modules/        # Feature modules (employees, payroll, attendance, etc.)
├── services/       # API calls / integration with backend
├── hooks/          # Custom hooks
├── types/          # TypeScript types/interfaces
├── assets/         # Images, icons, styles
└── main.tsx        # App entry point
```

## Getting Started

### Prerequisites

- Node.js (vXX or higher)
- npm or yarn
- Backend API running (see backend repo)

### Installation

```bash
git clone <repo-url>
cd <repo-name>
npm install
```

### Environment Variables

Create a `.env` file based on `.env.example`:

```
VITE_API_URL=http://localhost:3000/api
```

### Run the project

```bash
# Development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Testing

```bash
npm run test
```

## Branching Strategy

- `main`: production-ready code
- `dev`: integration branch for ongoing development
- `feature/*`: new features, branched from and merged into `dev`


## License

This project is for academic purposes.
