# FlightBook — Backend API

REST API and real-time server for the FlightBook flight booking and reservation platform. Built with Node.js, Express, MongoDB, and Socket.io as part of a GUVI MERN stack capstone project.

**Linked repositories**
- Frontend: [Flight-Booking-Frontend](https://github.com/NJRahul/Flight-Booking-Frontend)
- Admin Dashboard: [Flight-Booking-Admin](https://github.com/NJRahul/Flight-Booking-Admin)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MongoDB + Mongoose |
| Real-time | Socket.io |
| Auth | JWT + bcryptjs |
| Payments | Stripe |
| Email | Nodemailer (SMTP) |
| SMS | Twilio |
| Flights | Amadeus API (with MongoDB fallback) |
| PDF | PDFKit |
| Logging | Winston |

---

## Features

- **Authentication** — register, login, JWT-based sessions, forgot/reset password, email verification
- **Flight Search** — Amadeus API integration with automatic MongoDB fallback, one-way and round-trip
- **Booking Flow** — passenger details, seat selection, round-trip booking, auto-generated booking reference
- **Payments** — Stripe payment intents, webhook handling, refund processing
- **Notifications** — real-time Socket.io events + email + SMS (Twilio)
- **PDF Tickets** — downloadable boarding pass / itinerary via PDFKit
- **Admin API** — user management, flight/airline/airport CRUD, booking oversight, analytics
- **Rate Limiting** — per-route rate limiters via express-rate-limit
- **Security** — Helmet, CORS, input validation via express-validator

---

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── db.js              # MongoDB connection
│   │   ├── socket.js          # Socket.io setup
│   │   └── constants.js       # App-wide constants
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── flightController.js
│   │   ├── airportController.js
│   │   ├── bookingController.js
│   │   ├── paymentController.js
│   │   ├── notificationController.js
│   │   ├── savedSearchController.js
│   │   └── adminController.js
│   ├── middleware/
│   │   ├── auth.js            # JWT verify
│   │   ├── admin.js           # Admin role guard
│   │   ├── errorHandler.js
│   │   ├── rateLimiter.js
│   │   ├── validate.js
│   │   └── asyncHandler.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Flight.js
│   │   ├── Airport.js
│   │   ├── Airline.js
│   │   ├── Booking.js
│   │   ├── Notification.js
│   │   ├── Review.js
│   │   └── SavedSearch.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── flightRoutes.js
│   │   ├── airportRoutes.js
│   │   ├── bookingRoutes.js
│   │   ├── paymentRoutes.js
│   │   ├── notificationRoutes.js
│   │   ├── savedSearchRoutes.js
│   │   └── adminRoutes.js
│   ├── services/
│   │   ├── amadeusService.js  # Amadeus API + MongoDB fallback
│   │   ├── emailService.js
│   │   ├── paymentService.js
│   │   ├── pdfService.js
│   │   ├── smsService.js
│   │   ├── flightStatusService.js
│   │   └── schedulerService.js
│   ├── utils/
│   │   ├── apiResponse.js
│   │   ├── generateToken.js
│   │   ├── generateReference.js
│   │   ├── logger.js
│   │   └── mockFlightData.js
│   ├── seed.js                # Database seed script
│   └── server.js              # Entry point
├── .env.example
└── package.json
```

---

## Prerequisites

- Node.js 18+
- MongoDB 6+ (local or Atlas)
- npm 9+

Optional (for full functionality):
- Stripe account (test mode keys)
- Amadeus Developer account (free test tier)
- Gmail / SMTP credentials for email
- Twilio account for SMS

---

## Installation & Setup

```bash
# 1. Clone the repository
git clone https://github.com/NJRahul/Flight-Booking-Backend.git
cd Flight-Booking-Backend

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env with your values (see Environment Variables section)

# 4. Seed the database with sample data
npm run seed

# 5. Start the development server
npm run dev
```

The API will be available at `http://localhost:5000`.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/flight_booking

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRE=30d

# Stripe (use test keys for development)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_CURRENCY=inr

# Amadeus (free test tier at developers.amadeus.com)
AMADEUS_API_KEY=xxxxx
AMADEUS_API_SECRET=xxxxx
AMADEUS_HOSTNAME=test

# Email (Gmail App Password or SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_app_password
EMAIL_FROM_NAME=FlightBook
EMAIL_FROM_ADDRESS=noreply@flightbook.com

# URLs
FRONTEND_URL=http://localhost:5173
ADMIN_URL=http://localhost:5174
ADMIN_EMAIL=admin@flightbook.com
```

> **Note:** Amadeus and Stripe keys are optional for basic development — the app falls back to mock flight data when Amadeus is not configured, and payment flows are skipped in test mode.

---

## Database Seeding

```bash
npm run seed
```

Seeds the database with:
- **3 users** (admin + 2 regular users)
- **30 airports** (Indian domestic + major international)
- **10 airlines** (Indian carriers + international)
- **60 flights** (domestic and international routes)
- **5 bookings** (confirmed, pending, cancelled)
- **7 notifications**

---

## API Endpoints

### Auth — `/api/auth`
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/register` | Register new user | Public |
| POST | `/login` | Login and get JWT | Public |
| GET | `/me` | Get current user profile | Required |
| PUT | `/update-profile` | Update profile details | Required |
| PUT | `/update-password` | Change password | Required |
| POST | `/forgot-password` | Send password reset email | Public |
| PUT | `/reset-password/:token` | Reset password via token | Public |
| GET | `/logout` | Invalidate session | Required |

### Flights — `/api/flights`
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/search` | Search flights (one-way / round-trip) | Public |
| GET | `/:id` | Get flight details | Public |
| GET | `/:id/seat-map` | Get seat availability map | Public |
| GET | `/airlines` | List all airlines | Public |

### Airports — `/api/airports`
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/search` | Autocomplete airport search | Public |
| GET | `/popular` | Get popular airports | Public |
| GET | `/:code` | Get airport by IATA code | Public |

### Bookings — `/api/bookings`
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/` | Create a new booking | Required |
| GET | `/` | Get user's bookings | Required |
| GET | `/:id` | Get booking details | Required |
| PUT | `/:id/cancel` | Cancel a booking | Required |
| GET | `/:id/ticket` | Download PDF ticket | Required |

### Payments — `/api/payments`
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/create-intent` | Create Stripe payment intent | Required |
| POST | `/confirm` | Confirm payment and update booking | Required |
| POST | `/webhook` | Stripe webhook handler | Public |
| POST | `/refund` | Process refund | Required |

### Notifications — `/api/notifications`
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/` | Get user notifications | Required |
| PUT | `/:id/read` | Mark notification as read | Required |
| PUT | `/read-all` | Mark all as read | Required |

### Admin — `/api/admin`
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/dashboard` | Dashboard stats | Admin |
| GET | `/users` | List all users | Admin |
| PUT | `/users/:id` | Update user | Admin |
| GET | `/bookings` | List all bookings | Admin |
| GET | `/flights` | List all flights | Admin |
| POST | `/flights` | Create flight | Admin |
| PUT | `/flights/:id` | Update flight | Admin |
| DELETE | `/flights/:id` | Delete flight | Admin |
| GET | `/airports` | List airports | Admin |
| POST | `/airports` | Create airport | Admin |
| GET | `/airlines` | List airlines | Admin |

---

## Demo Credentials

After running `npm run seed`, use these accounts to log in:

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@flightbook.com` | `Admin@1234` |
| **User** | `alice@example.com` | `Alice@1234` |
| **User** | `bob@example.com` | `Bob@12345` |

> The admin account has access to the Admin Dashboard at `http://localhost:5174`.

---

## Stripe Test Cards

Use these cards in test mode (no real charges):

| Card | Number | Expiry | CVC |
|---|---|---|---|
| Visa (success) | `4242 4242 4242 4242` | Any future date | Any 3 digits |
| Auth required | `4000 0025 0000 3155` | Any future date | Any 3 digits |
| Declined | `4000 0000 0000 9995` | Any future date | Any 3 digits |

---

## Scripts

```bash
npm run dev    # Start with nodemon (auto-reload)
npm start      # Start without nodemon
npm run seed   # Seed database with sample data
```

---

## License

MIT
