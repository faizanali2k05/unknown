# 07 — Scope & Legal Boundary

This document exists to protect **you (the developer)** and to set crystal-clear expectations with the client. Attach it to the proposal. A signed scope is your best defense if anyone ever asks what this product does.

---

## 1. What Unknown is

A **closed-network communication app**. All calls, texts, and voicemail happen **between registered Unknown users, on the app's own servers**. The app is conceptually a private messaging/calling community — like Discord, Signal, or any walled-garden app.

## 2. The "display number" — exactly what it is

The display number is a **user-controlled profile label**. When one Unknown user contacts another, the sender chooses which label is shown to that other user. The recipient is **always another Unknown user inside the app**.

This is functionally identical to:
- Choosing a **username or display name** on Discord/Telegram,
- Setting a **caller name** in any in-app group, or
- Picking a **handle** on a social app.

It is **not** telephone caller ID, because:
- It never enters the public switched telephone network (PSTN),
- It is never transmitted to a phone carrier,
- It is only rendered by another app client that already knows it's an app-chosen label.

## 3. Why this is legal

Laws like the U.S. **Truth in Caller ID Act** govern transmitting **false caller ID into the public phone network with intent to defraud, cause harm, or wrongfully obtain value.** Unknown does none of that:
- No PSTN connection,
- No carrier-level caller ID injection,
- Communication strictly between consenting app users.

A label inside a closed app is ordinary product functionality. (As with any app, **users** remain responsible for not harassing or defrauding each other; the **platform** is a normal communication tool.)

---

## 4. IN scope (what we build)

| ✅ Included |
|------------|
| iOS + Android app (React Native), green/black theme, money-bag brand |
| Sign up / login (username, password, sequence number) |
| Acquire & manage in-app numbers |
| **In-app** voice calls between Unknown users (WebRTC/LiveKit) |
| **In-app** threaded text messaging between Unknown users |
| Custom **display number** (subscriber) — a label shown to other app users |
| Voicemail (record / store / playback) within the app |
| Push notifications (message + call wake-up) |
| Subscription billing (IAP / web) and server-side verification |
| Self-hosted deployment on the client's VPS |

---

## 5. OUT of scope (explicitly excluded)

| ❌ Not included — and not built |
|-------------------------------|
| Calling or texting **real phone numbers outside the app** (PSTN termination) |
| Injecting a chosen number as **caller ID on the public telephone network** |
| Any feature designed to make a call/text appear to a **non-user** as coming from an arbitrary number |
| Impersonation of businesses, banks, government, or any third party |
| Bulk/auto dialing or mass texting to external numbers (robocalls/robotexts) |
| App Store / Play Store **review and approval** (controlled by Apple/Google; separate step) |
| Carrier/telecom contracts, phone-number provisioning from a carrier |

> **Why excluded:** these would require connecting to the public phone network and/or transmitting caller ID externally. Beyond cost and infrastructure, doing so to deceive non-users can violate telecom law (e.g. Truth in Caller ID Act; penalties can reach tens of thousands of dollars per violation, and criminal exposure where fraud is intended). This product is deliberately built as a **closed, legal network** instead.

---

## 6. Client acknowledgements (put in the contract)

By accepting this scope, the client acknowledges:
1. Unknown is a **closed in-app network**; it does not call or text numbers outside the app.
2. The display number is an **in-app label**, not telephone caller ID, and is shown only to other app users.
3. **Server hosting** and **Apple/Google developer accounts** are billed to and paid by the client.
4. **App-store publishing** is a separate step controlled by Apple/Google and is not guaranteed within any fixed delivery window.
5. End users are responsible for lawful use of the platform.

---

## 7. Note on the original requirement images

Some requirement notes referenced sending texts/calls to **external real numbers** with an arbitrary caller ID. That specific behavior (reaching non-users on the public phone network with a spoofed identity) is **out of scope** for the reasons above. The delivered product satisfies the **same user experience** — pick any number as your identity, contact others, get replies — **within the legal closed-network model.**
