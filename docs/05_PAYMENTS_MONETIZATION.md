# 05 — Payments & Monetization

This is the part founders usually get wrong, so read carefully. The goal: take subscription money with the **lowest possible fees**, **legally**, given the app stores' rules and your location (Pakistan).

---

## 1. What you're charging for

The **subscriber tier** (multiple numbers, custom display number, extended voicemail). It's a **digital subscription** inside a mobile app — and that triggers specific app-store rules you cannot ignore.

---

## 2. The hard rule founders miss

If you sell a digital subscription **inside the iOS app** using your own payment form (Stripe, etc.), **Apple will reject the app.** Apple *requires* In-App Purchase (IAP) for digital goods, and takes **15–30%**. Google Play has the same rule (with similar 15–30%).

So you have three honest routes:

| Route | Fee | Legal? | Trade-off |
|-------|-----|--------|-----------|
| **A. Apple IAP / Google Play Billing** | 15–30% | ✅ Always allowed | Highest cut, but zero friction and guaranteed approval |
| **B. Web-based subscription, unlock in app** | ~3–8% (processor) | ✅ if done within store rules | Cheaper, but you must NOT show in-app purchase buttons that bypass IAP; user pays on your website, then the app reflects their status |
| **C. Hybrid** | Mixed | ✅ | IAP inside the app + a web option you mention outside the app |

### Recommended: start with **A (IAP)**, add **B (web)** as you grow
- IAP gets you approved and live fast, with no payment-compliance headaches.
- The **15% "small business" rate** applies if you earn under ~$1M/year (both Apple & Google offer this) — so realistically you pay **15%**, not 30%, early on.
- Once you have volume, add a **web checkout** (route B) to capture cheaper conversions, carefully following each store's external-purchase rules (which loosened in some regions in 2024–2025, but remain strict — implement exactly to current guidelines).

---

## 3. Taking money in Pakistan (the real constraint)

Receiving international subscription revenue from Pakistan needs the right rails:

| Method | Good for | Notes |
|--------|----------|-------|
| **Apple IAP / Google Play** | Global users paying in-app | Apple/Google pay you out to a supported bank account; check current PK payout support and set up tax/banking correctly |
| **Paddle** (Merchant of Record) | Web subscriptions | Paddle handles global tax/VAT and pays you out; often friendlier for non-US founders than raw Stripe |
| **Stripe** | Web subscriptions | Direct PK support is limited; many use **Stripe Atlas** (US LLC) — a real option but adds setup cost/admin |
| **Local gateways** (e.g. for PK-based users) | Domestic users | If you target local users, a local processor may be simplest |

> **Action:** Confirm current payout availability for your chosen method to a Pakistani account *before* building billing. This changes over time — verify at build time, don't assume.

---

## 4. How billing wires into the app (technical)

Regardless of provider, the pattern is the same — **the server is the source of truth**:

```
1. User taps "Upgrade".
2. Payment completes (IAP / Google Play / web checkout).
3. Client sends the receipt/token to:  POST /subscriptions/verify
4. NestJS verifies the receipt with the provider's API (Apple/Google/Paddle/Stripe).
5. On success → set User.subscription_tier = 'subscriber',
   subscription_expires_at = period end.
6. App reads tier from the API and unlocks the custom-display-number feature.
7. Provider webhooks (renewal, cancel, refund) hit:
   POST /webhooks/<provider>  → update Subscription + User.
```

Key rules:
- **Never trust the client** about subscription status — always verify server-side.
- Handle **renewals, cancellations, refunds, grace periods** via webhooks.
- Store a `Subscription` ledger row per provider event for audit.

---

## 5. Suggested pricing model (example, adjust to market)

| Plan | Price (example) | Includes |
|------|-----------------|----------|
| Free | $0 | 1 number, in-app calls/texts, basic voicemail |
| Subscriber Monthly | e.g. $4.99/mo | Multiple numbers, custom display number, extended voicemail |
| Subscriber Yearly | e.g. $39.99/yr | Same, discounted |

(These are placeholders — price against your target users and the 15% store cut.)

---

## 6. $0-to-build vs cost-to-operate (be clear with the client)

- **Building** the payment integration: **$0** (open-source SDKs, your own server).
- **Operating** it: you pay the **processor/store cut** (15% IAP, or ~3–8% web) **only when you earn**. There is no way to take card/app-store money with literally zero fee — that fee is the cost of getting paid, not a cost of building.
- This is separate from infra, which stays **$0** on your VPS.

---

## 7. Compliance checklist before going live

- [ ] Decide A / B / C route per platform.
- [ ] Confirm payout method works for a PK account.
- [ ] Implement server-side receipt verification + webhooks.
- [ ] Add Privacy Policy + Terms (required by both app stores).
- [ ] If using web checkout, implement it within current Apple/Google external-purchase rules for each region.
- [ ] Show subscription terms, price, and renewal clearly (store requirement).
