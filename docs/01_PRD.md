# 01 — Product Requirements Document (PRD)

**Product:** Unknown — Closed-Network Calling & Messaging App
**Platforms:** iOS & Android
**Prepared by:** TALHA
**Status:** Draft for client acceptance

---

## 1. Product summary

Unknown is a self-contained mobile communication app. Each user signs in, holds one or more in-app numbers, and communicates with **other Unknown users** through voice calls, text messages, and voicemail. All traffic stays inside the app's own network and servers.

The signature feature, available to **subscribers**, is the **custom display number**: a user can set the number shown to another user when calling or texting them. The recipient (another Unknown user) sees that chosen number, and replies route back inside the app.

### Why this framing matters
The display number is a **user-controlled label**, conceptually identical to a username or display name on Discord, Telegram, or any messaging app. Because all communication is between app users on the app's own network — and never injected into the public telephone system — this is a standard, legal product feature. See [`07_SCOPE_AND_LEGAL.md`](07_SCOPE_AND_LEGAL.md).

---

## 2. Target users & value

| User | What they get |
|------|---------------|
| Privacy-focused individuals | Talk and text without exposing a personal number; pick any display label |
| Small communities / groups | A private, branded communication space, walled off from the outside |
| Subscribers | The premium "set any display number" capability + extra numbers/voicemail |

**Core value proposition:** *"Your own private phone network. Pick any number you want as your identity, call and text other members, and stay completely inside the app."*

---

## 3. Brand & visual identity

- **App name:** Unknown
- **Logo:** Money-bag mark (replaces the PortSIP logo on login/splash)
- **Login splash:** "Unknown ✅📞" wordmark
- **Color theme:** Light green + black across the entire app (replaces PortSIP blue)
- **UI style:** Clean, mobile-first, dark base with light-green accents on both iOS & Android

---

## 4. Screens & flows

### 4.1 Page 1 — Splash / Brand
- Black/green splash with money-bag logo and "Unknown" wordmark.
- Auto-advances to login.

### 4.2 Page 2 — Sign Up / Login
Fields:
- **Username**
- **Password**
- **Sequence / Account number** (unique sign-in identifier)
- **Sign In** button
- Optional **Advanced** link (server/domain config, hidden by default)

Behavior: validates credentials against the backend; issues access + refresh tokens; routes to the home/numpad screen.

### 4.3 Home — three primary actions
After login, three clear icons are always reachable:
1. **Text Message**
2. **Call**
3. **Voicemail**

Bottom tab bar: **Contacts · Recents · Numpad · Messages · Settings**.

### 4.4 Page 3 — Dial Pad (Calling)
- Standard 12-key numpad (1–9, *, 0, #) with letter sub-labels.
- Green call button, voicemail shortcut, video placeholder (optional/disabled in MVP).
- **Subscriber control:** "Display number" selector — choose which of your numbers (or a custom display value) the called user will see.
- Calls connect to **other Unknown users**; recents and in-app contacts are listed.

### 4.5 Page 4 — Messaging
- Threaded chat list (like the example screenshot).
- Compose a message, choosing **which display number** it is sent from (subscriber feature).
- Recipient (another Unknown user) sees the chosen display number on the incoming message; reply returns to the sender in-app.
- Supports text now; media (images/voice notes) as a fast-follow.

### 4.6 Voicemail
- Receive, store, and play back voice messages left by other users.
- List with playback controls, timestamps, read/unread state.

### 4.7 Settings
- Manage numbers (acquire / label / set default display).
- Subscription status & upgrade.
- Account, notifications, theme, sign out.

---

## 5. Feature list (MVP vs. later)

| Feature | MVP (v1) | Later |
|---------|:--:|:--:|
| Sign up / login (username, password, sequence no.) | ✅ | |
| Acquire & manage in-app numbers | ✅ | |
| Voice calls between app users (WebRTC) | ✅ | |
| In-app threaded messaging | ✅ | |
| Custom display number (subscriber) | ✅ | |
| Voicemail (record / store / playback) | ✅ | |
| Push notifications (call + message wake-up) | ✅ | |
| Green/black theme + money-bag branding | ✅ | |
| Subscription billing | ✅ (web/IAP) | |
| Group chats / channels | | ✅ |
| Media messages (image, voice note) | | ✅ |
| Video calls | | ✅ |
| Contact import | | ✅ |

---

## 6. Subscriber (premium) tier

| Free | Subscriber |
|------|-----------|
| 1 in-app number | Multiple numbers |
| Calls & texts to app users | Same + **custom display number** |
| Basic voicemail | Extended voicemail storage |
| — | Priority routing / no limits |

Pricing model and billing mechanics: see [`05_PAYMENTS_MONETIZATION.md`](05_PAYMENTS_MONETIZATION.md).

---

## 7. Non-functional requirements

- **Performance:** call setup < 3s on normal networks; message delivery < 1s when both online.
- **Reliability:** offline messages queued and delivered on reconnect; voicemail when callee offline.
- **Security:** TLS everywhere; hashed passwords (argon2); JWT with refresh rotation; signed media URLs.
- **Scalability:** stateless API behind a proxy; Redis for presence; LiveKit scales rooms; start single-VPS, grow later.
- **Privacy:** users never see each other's real underlying account unless they share it; display numbers are labels.

---

## 8. Acceptance criteria (definition of done for v1)

1. A user can sign up, log in, and see the branded green/black UI with money-bag logo.
2. Two users can place and receive a clear voice call between their devices.
3. Two users can exchange text messages in a thread.
4. A subscriber can set a custom display number, and the recipient sees that number on the call/message.
5. A user can leave and play back a voicemail.
6. Push notifications wake the app for incoming calls and messages.
7. The whole system runs on the client's VPS via Docker with HTTPS.
