# Matchéa: Point-of-Sale, Inventory and Online Ordering System

A full-stack **MERN** web application (MongoDB, Express.js, React, Node.js) for a small matcha drink shop.

- **Customer website** (`/`): browse the menu, customise a drink (with a 3D cup preview), order ahead for pickup or delivery, pay by GCash / QR Ph, track the order live, collect loyalty stamps, chat with the shop.
- **Staff POS** (`/pos`): counter orders, online orders, barista screen, inventory with recipes and stock history, menu management, reports and end-of-day closing, customers, staff accounts, archive and backups.

**Integrative Programming and Technologies · Section INF243**
Instructor: Mr. Mark Anthony Gipit

## Group members

1. Sheng, Hubert Ryan C.
2. Bongo, John Onin D.
3. Carabido, John Briant V.
4. Lumanta, Alvin Clark P.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, CSS, three.js |
| Backend | Node.js, Express 4 (REST API) |
| Database | MongoDB Atlas with Mongoose (16 collections) |
| Security | bcryptjs (hashed PINs/passwords), JWT sessions, admin/cashier roles |
| Integrations | PayMongo (GCash / QR Ph), Google Sign-In, Gmail (Nodemailer), OpenStreetMap, Leaflet |
| Hosting | Render |

## Main features

- Authentication: staff sign in with name + PIN; customers with password, e-mail code or Google.
- CRUD: drinks, ingredients, expenses, staff accounts, shop settings; orders are created, updated and voided.
- Inventory: each drink's recipe takes ingredients out of stock automatically; low-stock warnings; full stock history.
- Input validation on both the browser and the server (`src/shared/rules.mjs`), with clear error messages.
- Central error handling, offline mode for the POS, daily backups, and an Archive to restore deleted records.
- Reports: sales by day/hour, best sellers, profit, busy times, ratings, monthly PDF and Excel export.
- Responsive design (phone, tablet, desktop), light and dark mode, lists shown 10 per page.

## Project structure

```
src/
  components/   POS screens (Register, Inventory, Menu, Reports, Staff, ...)
  shop/         customer website screens
  lib/          shared front-end helpers (API client, 3D cup, pager, printer, ...)
  shared/       rules used by BOTH the browser and the server (prices, VAT, validation, loyalty)
server/src/
  routes/       REST API, one file per area (/api/sales, /api/products, ...)
  models/       Mongoose schemas (database collections)
  middleware/   authentication and roles
  lib/          backups, payments, e-mail, archive, delivery helpers
  index.js      Express app and MongoDB connection
```

## Run it on your computer

Requirements: Node.js 20+ and a MongoDB Atlas database.

1. Install everything:
   ```
   npm install
   npm run install:server
   ```
2. Create `server/.env` (never upload this file) with at least:
   ```
   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/matcha_pos
   JWT_SECRET=<any long random text>
   SHOP_TZ=Asia/Manila
   ```
   Optional: `GOOGLE_CLIENT_ID`, `SMTP_USER`, `SMTP_PASS`, `PAYMONGO_SECRET_KEY`.
3. Load the starting menu (first time only): `npm run seed`
4. Start it in two terminals:
   ```
   npm run server     # API on http://localhost:5000
   npm start          # website on http://localhost:3000  (POS at /pos)
   ```

## Deploy (Render)

- Build command: `npm install && npm run install:server && npm run build`
- Start command: `npm run serve`
- Environment variables: the same as `server/.env`.

## Documentation

The full technical documentation (overview, objectives, scope, system architecture, database design, UI, features, testing and references) is submitted with the project.
