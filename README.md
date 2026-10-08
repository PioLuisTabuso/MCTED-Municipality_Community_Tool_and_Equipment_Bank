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

## API Endpoints (planned)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server + DB health check |
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login and receive JWT |
| GET | `/api/tools` | List all available tools |
| POST | `/api/tools` | Create a new tool listing |
| POST | `/api/rentals` | Request to rent a tool |
| POST | `/api/feedback` | Submit a rating/review |

---

## Notes

- **Never commit `.env`** – it is gitignored. Only commit `.env.example`.
- **Never commit the `uploads/` folder contents** – also gitignored.
- Use `pnpm` only. Do not use `npm` or `yarn`.
