# MCTEB – Municipal Community Tool & Equipment Bank

A web-based peer-to-peer tool lending platform for residents of a municipality.
Residents can list tools they own and rent tools from their neighbours.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (LTS) |
| Framework | Express 5 |
| Database | MySQL / MariaDB |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| File uploads | Multer |
| Validation | express-validator |
| Package manager | pnpm |

---

## Getting Started (for teammates)

```bash
# 1. Clone the repository
git clone <repo-url>
cd MCTEB-Sys

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env
#    Open .env and fill in your DB credentials and a JWT secret

# 4. Create the database in MySQL
mysql -u root -p -e "CREATE DATABASE mcteb_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 5. (Once schema is ready) Apply the schema and seed data
mysql -u root -p mcteb_db < database/schema.sql
mysql -u root -p mcteb_db < database/seed.sql

# 6. Start the development server (auto-restarts on file changes)
pnpm dev
```

The server starts at **http://localhost:3000**.  
Health check: **http://localhost:3000/api/health**

---

## Folder Structure

```
MCTEB-Sys/
├── src/
│   ├── server.js            # Entry point – starts the HTTP server
│   ├── app.js               # Express app setup, middleware, route mounting
│   ├── config/
│   │   └── db.js            # MySQL connection pool (mysql2/promise)
│   ├── routes/              # Route definitions (one file per module)
│   │   ├── authRoutes.js
│   │   ├── toolRoutes.js
│   │   ├── rentalRoutes.js
│   │   └── feedbackRoutes.js
│   ├── controllers/         # Request handler functions (business logic)
│   │   ├── authController.js
│   │   ├── toolController.js
│   │   ├── rentalController.js
│   │   └── feedbackController.js
│   ├── middleware/
│   │   ├── authMiddleware.js    # JWT verification
│   │   └── errorMiddleware.js  # Global error handler
│   └── utils/               # Shared helpers (token helpers, upload config, etc.)
├── public/
│   └── index.html           # Static landing page
├── uploads/                 # User-uploaded files (gitignored)
├── database/
│   ├── schema.sql           # Database table definitions
│   └── seed.sql             # Sample/test data
├── docs/                    # Project documentation
├── .env.example             # Environment variable template
├── .gitignore
├── package.json
└── README.md
```

---

## API Endpoints Reference

### Authentication & Profile (`/api/auth`)
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/api/auth/register` | Public | Register resident with multipart ID photo upload |
| POST | `/api/auth/login` | Public | Authenticate user & return JWT token |
| GET | `/api/auth/me` | Authenticated | Fetch active user profile |

### Admin & Staff Verification (`/api/admin`)
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/admin/users/pending` | Staff/Admin | List users pending ID verification |
| GET | `/api/admin/users/:id/id-image` | Staff/Admin | Securely stream submitted ID photo |
| PATCH | `/api/admin/users/:id/verification` | Staff/Admin | Approve or reject resident ID verification |

### Tool Catalog & Inventory (`/api/tools`)
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/tools` | Public | Browse tools with category filter, search, & pagination |
| GET | `/api/tools/categories` | Public | List tool categories with counts |
| GET | `/api/tools/:id` | Public | Detailed tool info with average ratings & availability |
| POST | `/api/tools` | Staff/Admin | Add new tool with photo upload |
| PUT | `/api/tools/:id` | Staff/Admin | Update tool info, specs, fee, quantity, or photo |
| DELETE | `/api/tools/:id` | Admin | Delete/archive tool from active catalog |
| GET | `/api/tools/:id/maintenance` | Staff/Admin | View maintenance history and active complaints |
| PATCH | `/api/tools/:id/maintenance` | Staff/Admin | Update tool condition / maintenance status |

### Rentals & Reservations (`/api/rentals`)
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/api/rentals` | Verified Resident | Create reservation request with date-conflict checks |
| GET | `/api/rentals` | Authenticated | Residents see own rentals; staff/admin see all |
| GET | `/api/rentals/:id` | Authenticated | View rental details |
| PATCH | `/api/rentals/:id/approve` | Staff/Admin | Approve rental request & generate provisional receipt |
| PATCH | `/api/rentals/:id/decline` | Staff/Admin | Decline rental request |
| PATCH | `/api/rentals/:id/cancel` | Resident | Cancel own pending rental request |
| PATCH | `/api/rentals/:id/activate` | Staff/Admin | Mark tool physically released to resident |
| POST | `/api/rentals/:id/return` | Staff/Admin | Return inspection; auto-calculates late & damage fees |
| POST | `/api/rentals/:id/payment` | Authenticated | Record payment simulation & generate reference number |
| GET | `/api/rentals/:id/receipt` | Authenticated | View official digital rental receipt |
| PATCH | `/api/rentals/:id/penalty` | Staff/Admin | Settle or waive late/damage penalty |

### Feedback, Complaints & Notifications (`/api/feedback`)
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/feedback/reviews` | Public | List reviews with average rating for a tool |
| POST | `/api/feedback/reviews` | Verified Resident | Submit 1–5 star rating & review for completed rental |
| PATCH | `/api/feedback/reviews/:id/moderate` | Staff/Admin | Moderate review visibility |
| POST | `/api/feedback/complaints` | Authenticated | Report defective tool with photo/media upload |
| GET | `/api/feedback/complaints` | Staff/Admin | List and manage defective tool complaints |
| POST | `/api/feedback/info-update` | Authenticated | Request correction of resident profile data |
| GET | `/api/feedback/info-update` | Staff/Admin | View pending profile data correction requests |
| PATCH | `/api/feedback/info-update/:id/resolve` | Staff/Admin | Approve or reject profile data correction |
| GET | `/api/feedback/notifications` | Authenticated | List in-app notifications & unread count |
| PATCH | `/api/feedback/notifications/:id/read` | Authenticated | Mark notification as read |
| PATCH | `/api/feedback/notifications/read-all` | Authenticated | Mark all notifications as read |

---

## Notes

- **Never commit `.env`** – it is gitignored. Only commit `.env.example`.
- **Never commit the `uploads/` folder contents** – also gitignored.
- Use `pnpm` only. Do not use `npm` or `yarn`.
