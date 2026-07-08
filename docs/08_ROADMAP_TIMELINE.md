# 08 — Roadmap & Honest Timeline

Straight talk on what's achievable, so neither you nor the client is set up to fail.

---

## 1. The 5-hour reality

A production-ready VoIP + messaging app **does not get built in 5 hours.** Anyone who promises that is either lying or will hand over something broken. CallKit/PushKit, NAT traversal, app-store builds, and real-device call testing alone eat far more than 5 hours.

**What 5 hours *can* realistically produce** (a strong demo to make the client happy):

| In 5 focused hours | Outcome |
|--------------------|---------|
| Backend scaffold (NestJS + Postgres + Redis via Docker) | Auth + users + numbers working |
| LiveKit + coturn up on the VPS | Audio room joinable |
| React Native shell with green/black theme + money-bag splash + login + numpad + chat UI | Looks like the real product |
| One end-to-end path | Two test clients exchange a message and/or join a call |

That's a **convincing MVP demo** — enough to show the client the app exists, looks right, and works in principle. Not a store-ready app.

---

## 2. Realistic full-build timeline

| Phase | Scope | Effort (1 experienced dev) |
|-------|-------|----------------------------|
| **0. Setup** | Repos, Docker, CI, VPS base, domain/SSL | 0.5–1 day |
| **1. Backend core** | Auth, numbers, conversations, messages, presence | 3–4 days |
| **2. Calls** | LiveKit integration, signaling, coturn, call lifecycle | 3–5 days |
| **3. Mobile app** | RN UI (all screens), API + WS wiring, theme/brand | 5–7 days |
| **4. Calls on device** | CallKit/CallKeep, PushKit VoIP push, FCM, real-device testing | 3–5 days |
| **5. Voicemail + media** | MinIO, record/playback, signed URLs | 2–3 days |
| **6. Billing** | IAP/web subscription + server verification + webhooks | 2–4 days |
| **7. Polish + QA** | Edge cases, reconnection, error states, store assets | 3–5 days |
| **8. Store submission** | Builds, metadata, privacy policy, review back-and-forth | 2–5 days (+Apple/Google review wait) |

**Total: roughly 4–6 weeks** for a polished, submittable v1 — faster if you cut later-stage features, slower with revisions.

---

## 3. Suggested milestone plan (for the client)

| Milestone | Deliverable | Client sees |
|-----------|-------------|-------------|
| **M1 (Day 0–1)** | Demo MVP | Branded app shell, login, a working message/call between two test devices |
| **M2 (Week 1–2)** | Backend complete | All APIs, messaging, presence live on VPS |
| **M3 (Week 2–3)** | Calls solid on real devices | Reliable call ring/answer with CallKit + push |
| **M4 (Week 3–4)** | Feature-complete | Voicemail, subscriber/display number, billing |
| **M5 (Week 4–6)** | Store-ready | Polished build submitted to TestFlight/Play |

Tie payments to milestones (e.g. deposit → M1, progress → M3, balance → M5). This protects both sides far better than "50% now, 50% on delivery in 24h."

---

## 4. Note on the proposal numbers

The earlier HTML proposal had inconsistencies (a "$2,000" total but a "remaining 50% = $3,000," and a "24-hour" full delivery). Before sending anything to a client, fix:
- One consistent fee,
- A realistic timeline (use the milestones above),
- Matching deposit/balance math.

A clean, honest proposal wins more trust — and more repeat business — than an impossible promise that blows up in week one.

---

## 5. What to do right now

1. Stand up the **MVP demo** (Phase 0 + a thin slice of 1–3) on your VPS — that's your "wow" for the client.
2. Present this documentation set as the **project plan** — it signals you're a serious engineer, not a 24-hour gamble.
3. Agree milestones + payment schedule.
4. Build phase by phase.
