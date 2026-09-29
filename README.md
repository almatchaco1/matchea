# AL Matcha Co POS: how to run it

Your old movie app is saved in `_backup_movie_app/`.

## First time only

1. Create a free MongoDB database at https://www.mongodb.com/atlas (M0 cluster).
   Add a database user, allow your IP under Network Access, and copy the connection string from Connect → Drivers.
2. In VS Code, open `server/.env` and paste the string into `MONGODB_URI`
   (add `matcha_pos` after the last `/`), for example:
   `MONGODB_URI=mongodb+srv://al:yourpass@cluster0.abcde.mongodb.net/matcha_pos`
3. In a VS Code terminal:
   ```
   npm run seed
   ```
   This loads the AL Matcha Co menu and creates the admin **Owner** with PIN **1234**.

## Every time

Open two terminals in VS Code (the + button in the terminal panel):

| Terminal 1 | Terminal 2 |
|---|---|
| `npm run server` | `npm start` |

The app opens at http://localhost:3000. Stop either one with Ctrl + C.

## Where things are

- `src/`: the React app (Register, Inventory, Menu, Reports screens are in `src/components/`)
- `src/shared/pricing.mjs`: price, VAT and discount rules, used by both the app and the server
- `server/`: Express + MongoDB API (`server/src/models` are the database collections)

## Two sites in one

| Address | Who | What |
|---|---|---|
| `/` | Customers | Menu with photos, order ahead, track the order (pickup only, pay at the counter) |
| `/pos` | Staff | Sign in with name + PIN. Register, **Online** orders, Inventory, Menu, Reports |

Online orders: **New → Accept** (stock is taken) **→ Mark ready → Picked up · Take payment**.
Pause online ordering any time from the Online tab or Menu → Shop & options.

## Put it online (so customers can reach it)

Your computer's `localhost` only works on your own Mac. To let everyone in, deploy to a host:

1. Push this folder to a **private GitHub repository** (`server/.env` is ignored and never uploaded).
2. Create a free account at **render.com** → **New → Web Service** → pick the repo.
3. Settings:
   - Build command: `npm install && npm run install:server && npm run build`
   - Start command: `npm run serve`
4. **Environment variables** (Render → Environment): `MONGODB_URI`, `JWT_SECRET`, `SHOP_TZ=Asia/Manila` — copy the values from `server/.env`.
5. In MongoDB Atlas → Network Access, keep `0.0.0.0/0` (Render's IP changes).
6. Deploy. Render gives you an address like `https://al-matcha-co.onrender.com`.
   - Customers: `https://al-matcha-co.onrender.com/`
   - Staff: `https://al-matcha-co.onrender.com/pos`
7. Optional: buy a domain (e.g. `almatchaco.com`) and add it under Render → Settings → Custom Domains.

Note: Render's free plan sleeps after 15 minutes without visitors, so the first page load can take ~50 seconds.
For a shop that's open all day, use the paid "Starter" plan so it stays awake.

## Online payment (PayMongo)

Customers can choose **Pay now** (GCash, Maya, QR Ph on PayMongo's secure page) or **Pay at pickup**.
Without PayMongo keys, only pay at pickup is shown.

1. Sign up at **dashboard.paymongo.com**. You can test right away; real payments need account activation (business documents).
2. Developers → API keys → copy the **secret key** into `server/.env` as `PAYMONGO_SECRET_KEY` (`sk_test_…` first).
3. When the site is online: Developers → Webhooks → add `https://YOUR-SITE/api/public/paymongo/webhook`
   with event **checkout_session.payment.paid**, and put its secret in `PAYMONGO_WEBHOOK_SECRET`. Set `PUBLIC_URL` to your site address.
4. Restart the server. The Online tab shows "Online payment · test mode" (or "on" with live keys).

How it works:
- A pay-now order stays hidden from staff until it's paid, then appears in **New** marked *Paid online*. At pickup, staff just tap **Picked up**.
- If the customer doesn't pay within 45 minutes, the order is cancelled automatically.
- Payment is confirmed by the webhook, and also checked when the customer returns to their order page (so it works on localhost without a webhook).
- If staff cancel a paid order, it's marked **refund due**: refund it in the PayMongo dashboard using the payment reference shown.

## Customer accounts (sign up / sign in)

Customers must sign in before they can see the menu and order. Mobile number + password works right away. The Google and Facebook buttons only appear once you add their keys to `server/.env` (then restart `npm run server`).

**Google**
1. Go to console.cloud.google.com → create a project → APIs & Services → OAuth consent screen (External, add your shop name and email).
2. Credentials → Create credentials → OAuth client ID → Web application.
3. Authorized JavaScript origins: `http://localhost:3000` and later your live address (e.g. `https://almatcha.onrender.com`).
4. Copy the Client ID into `GOOGLE_CLIENT_ID=` in `server/.env`.

**Facebook**
1. Go to developers.facebook.com → My Apps → Create app → "Authenticate and request data from users with Facebook Login".
2. App settings → Basic: copy App ID and App Secret into `FACEBOOK_APP_ID=` and `FACEBOOK_APP_SECRET=`. Add your live domain to App Domains.
3. Facebook Login → Settings: add your live address to Allowed Domains for the JavaScript SDK. Facebook requires `https` for the live site; `localhost` works while testing.
4. Switch the app to Live mode when you go live.

After Google/Facebook sign-in, customers are asked once for their mobile number. Forgot password: customers ask at the counter (reset it by setting a new one from the database for now).

## Stamp card, best sellers, low-stock alerts, order-ready texts

**Stamp card:** 1 stamp per drink, 9 stamps = the 10th drink free (its regular-size price comes off; upsize and add-ons are still charged).
- Online: stamps are added when the order is picked up. Customers see their card in their account and on the menu, and tick "Use my free drink" at checkout.
- At the counter: type the customer's mobile number in "Stamp card" on the register and press Find. Their stamps are added with the sale, and you can tick "Use free drink".
- Cancelled or voided orders give back the stamps they used and take back the stamps they earned.

**Best sellers:** Menu → Edit a drink → "Best seller badge". Putobumbong and S'mores are marked to start.

**Low stock:** a yellow bar shows on every POS tab when something reaches its reorder level or will run out within 3 days. Inventory → "Restock list" suggests how much to buy for about a week; copy it into a message to your supplier or download it.

**Order-ready text:** when staff tap Ready on an online order, the customer gets one SMS.
1. Sign up at semaphore.co and buy credits (₱0.56 per text plus VAT, as listed on semaphore.co in Sept 2026).
2. Account → API: copy your API key into `SEMAPHORE_API_KEY=` in `server/.env`.
3. Optional: register a sender name (like ALMATCHA) and put it in `SEMAPHORE_SENDER=`.
4. Restart `npm run server`. When you go live, set `PUBLIC_URL=` so the text includes the tracking link.
Without a key, no texts are sent; customers still get a chime, a banner and a notification on the ordering site.

## Backups

The server saves a copy of **all** data (sales, menu, stock, staff, customers, stamps, ratings) once a day into `server/backups/`, and keeps the newest 30.
- Reports tab → **Backups**: see the last backup, press **Back up now**, or **Download** one.
- Download one every week and keep it somewhere safe (Google Drive, a USB stick). The files contain customer details: don't share them.
- To put a backup back (replaces everything; a safety copy of the current data is made first):
  `npm run restore -- backup-2026-09-24_0900-daily.json.gz` then type `RESTORE`, then restart `npm run server`.
- When the site is hosted online (e.g. Render), its disk is wiped on every update, so the Download button is your real backup there.

## Receipt printer (one tap, no print window)

Works in **Google Chrome or Microsoft Edge** with any ESC/POS thermal printer (58 mm or 80 mm, e.g. Xprinter, Epson TM, GOOJPRT).
1. POS header → **Printer** → pick how it's connected: USB cable, Bluetooth paired on this computer, or Bluetooth from an Android tablet.
2. Choose the paper width and press **Print test page**.
3. Tick **Print automatically after each sale** if you want every receipt printed without pressing Print.
The setting is saved on that device. iPads/iPhones can't talk to printers this way; they use the normal print window.
Windows only: if Chrome can't open a USB printer, the printer's own driver is holding it. Use the Bluetooth/serial option, or print through the print window.

## Favourite drinks and ratings

- Customers tap **Save these choices as a favourite** on a drink. Favourites appear at the top of the menu with a one-tap **Add**.
- After pickup, customers can rate the order (1–5 stars + comment) for 14 days. Only admins see ratings: Reports tab → **Customer ratings**.
