// Privacy Policy and Terms of Service pages (linked from Google sign-in and the footer).
const UPDATED = 'September 25, 2026';

export function Privacy({ shop }) {
  const name = shop?.name || 'Matchéa';
  const email = shop?.email || 'almatchaco1@gmail.com';
  return (
    <article className="panel legal">
      <p className="legal-kicker">Last updated {UPDATED}</p>
      <h1>Privacy Policy</h1>
      <p>{name} (“we”, “us”) runs this ordering website. This page explains what information we collect when you use it, how we use it, and your choices. We follow the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account details:</b> your name, mobile number, and password (stored scrambled, never in plain text). If you sign in with Google or Facebook, we receive your name, email address and profile picture from them. We never see your Google or Facebook password.</li>
        <li><b>Orders:</b> the drinks you order, notes you add, the total, how you paid, and payment reference numbers you give us (for example a GCash reference).</li>
        <li><b>Stamp card and favourites:</b> your stamps, free-drink rewards, saved drinks and order ratings.</li>
        <li><b>Sign-up codes:</b> when we email or text you a 6-digit code, we keep only a scrambled copy for up to 10 minutes.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To make and hand over your order, and to contact you if there’s a problem with it.</li>
        <li>To show your order status, send you an “order ready” alert if you turned it on, and keep your stamp card.</li>
        <li>To confirm it’s really you when you sign up, and to keep accounts safe.</li>
        <li>To understand what sells (for example, total sales by drink). This is counted as totals, not about you personally.</li>
      </ul>
      <p>We do <b>not</b> sell or rent your information, and we don’t use it for ads.</p>

      <h2>Who else sees it</h2>
      <p>Only our staff, and only what they need to prepare your order. We use trusted services to run the site: our database host (MongoDB Atlas), Google (sign-in and sending code emails), Facebook (sign-in), and PayMongo, GCash or Maya when you pay online. They handle your data only to provide those services.</p>

      <h2>How long we keep it</h2>
      <p>We keep your account and order history while your account is active, and our sales records as long as the law requires for business records. You can ask us to delete your account at any time.</p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>See and change your name and mobile number on your Account page.</li>
        <li>Turn “order ready” texts on or off on your Account page.</li>
        <li>Ask for a copy of your data, a correction, or to delete your account by emailing <a href={`mailto:${email}`}>{email}</a>.</li>
      </ul>

      <h2>Keeping it safe</h2>
      <p>The site uses a secure (HTTPS) connection, passwords are stored scrambled, and repeated wrong sign-in attempts are blocked. No website is perfectly secure, but we work to protect your information.</p>

      <h2>Contact</h2>
      <p>Questions about your privacy? Email <a href={`mailto:${email}`}>{email}</a>{shop?.phone ? <> or call {shop.phone}</> : null}.</p>
    </article>
  );
}

export function Terms({ shop }) {
  const name = shop?.name || 'Matchéa';
  const email = shop?.email || 'almatchaco1@gmail.com';
  return (
    <article className="panel legal">
      <p className="legal-kicker">Last updated {UPDATED}</p>
      <h1>Terms of Service</h1>
      <p>By creating an account or placing an order on this website, you agree to these terms.</p>

      <h2>Your account</h2>
      <ul>
        <li>Give us your real name and a mobile number we can reach you on.</li>
        <li>Keep your password to yourself. You’re responsible for orders placed from your account.</li>
      </ul>

      <h2>Orders and pickup</h2>
      <ul>
        <li>All orders are for pickup at the counter. Show your order number when you collect it.</li>
        <li>Prices are in Philippine pesos and shown before you order. Menu items and prices may change.</li>
        <li>If a drink runs out after you order, we’ll contact you to change it or cancel it.</li>
        <li>Please pick up your drinks on time. Drinks left for a long time may not taste their best.</li>
      </ul>

      <h2>Payment</h2>
      <ul>
        <li>You can pay at the counter, or pay online with GCash, Maya or QR when available. We don’t accept card payments.</li>
        <li>If you pay by scanning our QR, enter the correct reference number. We check each payment before preparing your order.</li>
      </ul>

      <h2>Cancelling and refunds</h2>
      <ul>
        <li>You can cancel an order on its tracking page until we start preparing it.</li>
        <li>If we cancel an order you already paid for, we’ll refund you the full amount.</li>
      </ul>

      <h2>Stamp card</h2>
      <ul>
        <li>You get one stamp per drink when you pick up your order. After 9 stamps, your next drink (regular size) is free. Upsizes and add-ons are still charged.</li>
        <li>Stamps have no cash value and can’t be transferred. We may change the stamp card rules with notice on this site.</li>
      </ul>

      <h2>Fair use</h2>
      <p>Please don’t misuse the site, for example with fake orders or by trying to break it. We may close accounts that do.</p>

      <h2>Contact</h2>
      <p>{name} · <a href={`mailto:${email}`}>{email}</a>{shop?.phone ? <> · {shop.phone}</> : null}</p>
    </article>
  );
}
