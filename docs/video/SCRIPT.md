# Incident Desk - demo video script

**Team:** Shourya · Krishna · Yashraj  **Target length:** 19:20 (hard cap 20:00; the brief asks for 15-20 min)
**File name:** `<Group No>_OOP_S1_2025-2026_Project` (the PDF literally says 2025-2026; confirm with your instructor)
**Deadline:** 22 Nov 2026, hard. Every number, label and result line below was checked against the running app: Workflows 1 and 3 were clicked through in the real UI; the strategy simulation, illegal transition, login errors and restart-persistence were run against the real server. Still do one full rehearsal before the real take.

> **The rule of this video: the real site is the video.** You are showing a working product, so almost every second is the live app, the terminal or the code. There are **two short slide cards** in the whole 19 minutes (a 4-second title card and a 25-second architecture picture), under 30 seconds of slides in total.
> The brief's rules for the video: all members appear · each introduces themselves and **explains a module** · **at least 3 complete workflows** · 15-20 min · recording of the working app.
> Role assignment below is a suggestion - swap names freely, but keep each person naming *their* module in their intro.

---

## 0. What is on screen, and when

| # | Time | Segment | Who | On screen | Rubric line it earns |
|---|---|---|---|---|---|
| 1 | 0:00-0:40 | Cold open: three intros | all | webcam → the **real sign-in screen** | Documentation & presentation (10) |
| 2 | 0:40-1:10 | The problem, in 30 seconds | Shourya | **real app** (the three role dashboards) | Design (10) |
| 3 | 1:10-4:25 | **Workflow 1** employee reports → prioritised → assigned → notified | Shourya | **real app** | **Functionality (60)**, UX (10) |
| 4 | 4:25-7:55 | **Workflow 2** technician investigates → SLA → resolved → user notified | Krishna | **real app** | **Functionality (60)** |
| 5 | 7:55-12:10 | **Workflow 3** duplicates → correlation → escalation | Yashraj | **real app** | **Functionality (60)**, Innovation (10) |
| 6 | 12:10-13:40 | **Live simulation:** 8 incidents, two assignment strategies | Krishna | **real app + terminal** | Functionality (60), Technical depth (15) |
| 7 | 13:40-15:10 | Admin tour: search, services, people, SLA, reports, audit | Shourya | **real app** | Functionality (60) |
| 8 | 15:10-17:10 | Under the hood: architecture, code, live proofs | Krishna → Yashraj | 25 s picture · **code** · **terminal + real server** | Design (10), Technical depth (15) |
| 9 | 17:10-18:20 | Security, errors, tests, terminal client | Yashraj | **terminal** | Testing (5), Technical depth (15) |
| 10 | 18:20-18:50 | Roles and look & feel | Shourya | **real app** | UX (10), Innovation (10) |
| 11 | 18:50-19:20 | Closing | all | webcam | Documentation & presentation (10) |

**Live-time budget:** ≈ 18:30 of 19:20 is the real app, the terminal or the code. Slides: **0:29**.
**If you run over,** cut in this order: segment 10 (30 s) → the steps marked *(optional)* → one code shot in segment 8.

---

## 1. Setup (do this once, 20 minutes)

### Machines & files
* Node.js **22.13+**. In the project folder, no `npm install` is needed (zero dependencies).
* Everyone uses the same branch: `git fetch && git checkout feature/backend-and-ui-migration && git pull`.
* The one slide you will use is in `docs/video/slides.html` (double-click to open; slide 4 is the architecture picture, slide 1 the title card). The other slides are optional backup, not part of the plan.

### Screen & audio
* **1920×1080**, browser full screen, zoom **110-125 %** so text is readable at video size. Hide the bookmarks bar, close other tabs, turn on **Do Not Disturb**.
* Make the cursor easy to follow (System Settings → Accessibility → Display → Pointer size; or a free tool such as Mouseposé).
* Record with **QuickTime** (File → New Screen Recording) or **OBS**. Record **voice-over separately** per segment in a quiet room (QuickTime audio recording or a phone).
* Appearance menu: use **Light + Harbor** for the demo takes (best contrast on video). Show Dark and other palettes only in segment 10.

### Demo mode (important - this is what makes it repeatable)
Normal mode uses the real clock and a background monitor, so a P1 incident would escalate by itself *while you are talking*. Demo mode freezes the clock and turns the monitor off. **Time only moves when you press "Advance clock".**

```bash
npm run demo        # clean database: you create every incident live       (Takes 1, 2, 3)
npm run demo:rich   # database with sample incidents and history already in it   (Take 4: B-roll)
npm run simulate    # fires 8 realistic incidents at the running server (segment 6)
```
Running `npm run demo` or `npm run demo:rich` again **resets** that demo database. Stop with `Ctrl+C`. Open http://localhost:4173.

### Recording order (this is NOT the video order)
| Take | Start state | Record | Becomes |
|---|---|---|---|
| **Take 1** | `npm run demo` | Workflow 1 → Workflow 3 → Admin tour → code/terminal proofs → **restart proof last** | segments 3, 5, 7, 8 (live part), 9 |
| **Take 2** | `npm run demo` (reset) | Workflow 2 | segment 4 |
| **Take 3a** | `npm run demo` (reset) | strategy = *Least loaded* → `npm run simulate` | segment 6 |
| **Take 3b** | `npm run demo` (reset) | strategy = *Experience based* → `npm run simulate` | segment 6 |
| **Take 4** | `npm run demo:rich` | the three role dashboards, reports, dark mode, phone width | segments 2, 10 |
| **Take 5** | none | webcam intros/closing, code shots, the one architecture slide | segments 1, 8, 11 |

> Why separate takes? Workflow 3 advances the clock until incidents escalate, and the strategy comparison needs an empty system. Mixing them gives wrong numbers.

### Browser trick that saves minutes of logging in and out
Each browser **tab** keeps its own login. Open three tabs: **Tab 1 = Jordan (employee)**, **Tab 2 = technician**, **Tab 3 = admin**, and switch with `Ctrl+Tab`. Pages refresh every 8 seconds; click **Alerts** or the page name to refresh instantly.

### Accounts (password: see `backend/seed.js`)
| Email (`@incidentdesk.test`) | Role | Used for |
|---|---|---|
| `jordan` | Employee | Workflows 1 and 3 |
| `maya` | Employee | Workflows 2 and 3 |
| `asha` | Technician | gets the payment incidents (Application skill) |
| `ravi` | Technician | gets the Wi-Fi incident (Network skill) |
| `neha`, `lead` (Team Lead Priya Nair) | Technician | escalation targets / simulation |
| `admin` (System Administrator Sam Rivera), `manager` (IT Manager Dana Whitfield) | Administrator | demo clock, reports, admin pages |
| *registered live:* `student` | Employee | Workflow 3 (shows self-registration) |

### Preflight checklist
- [ ] `npm test` shows **55 passing**
- [ ] `npm run demo` running, http://localhost:4173 shows the sign-in screen
- [ ] Appearance → **Light** + **Harbor**
- [ ] Three tabs open and signed in (Jordan / Ravi / admin)
- [ ] Section 13 of this file (copy-paste text and terminal helper) open on a second screen
- [ ] A terminal window ready with the helper from section 13 already pasted (password set off camera)
- [ ] Notifications off, phone silenced, mic tested

---

## 2. Segment 1 - Cold open (0:00-0:40) · ALL · on camera

**Screen:** webcam for each person's line (3 quick shots), then the **real sign-in screen** fills the frame behind the last line. (Optional 4-second title card from slide 1.)

> **SHOURYA:** Hi, I'm Shourya. I built the employee side of Incident Desk: reporting, the priority preview and the notifications you'll see.
> **KRISHNA:** I'm Krishna. I worked on the domain model: the incident lifecycle, the design patterns and the structure of the SLA engine.
> **YASHRAJ:** And I'm Yashraj. I built the intelligent features, the SLA monitor with escalation, and the reports.
> **SHOURYA:** This is Incident Desk, our intelligent IT service management system. It's a real running application, so we'll show it working: three complete workflows, a live simulation, the admin side, and then what's under the hood.

*(Adjust each "I built…" line to what each of you really did; the brief wants each person to explain a module they know.)*

---

## 3. Segment 2 - The problem in 30 seconds (0:40-1:10) · SHOURYA

**Screen (Take 4, `npm run demo:rich`):** flip quickly through the **real** Employee, Technician and Administrator dashboards (three tabs). Land on the admin Overview with its stat cards, incident queue and team workload.

> **SHOURYA:** In a real organisation, hundreds of IT incidents arrive every day. Done by hand they get answered late, prioritised wrongly, given to whoever happens to be free, and nobody notices when a deadline is missed. What you're looking at is our answer: three different views for three kinds of user, one system underneath. An employee reports, a technician fixes, an administrator oversees. Let's start with the employee.

---

## 4. Segment 3 - WORKFLOW 1: employee reports → prioritised → assigned → notified (1:10-4:25) · SHOURYA

**Take 1, fresh `npm run demo`. Tab 1.** Goal sentence on screen (lower third): *Workflow 1: Employee reports → system prioritises → technician assigned → notification generated.*

| # | Do this on screen | Say |
|---|---|---|
| 1 | Show the **Sign in** screen. Click the **Register** tab for 1 second, back to Sign in. Sign in as `jordan`. | "Three kinds of users sign in here: employees, technicians and administrators. I'm Jordan, an employee." |
| 2 | Overview page. Point at the hero, the 4 stat cards, the nav (only Overview / Incidents / Knowledge base / Terminal). | "An employee sees only their own incidents and only the pages they need. Let's report a problem." |
| 3 | Click **Report incident**. Type (paste from section 13): title `Payment application unavailable`, service **Payment portal**, description `Users are unable to complete transactions in the payment application.` | "I describe the problem in plain words. I don't pick a category or a priority." |
| 4 | Set **Impact** = *Organization wide*, **Urgency** = *Work has stopped*, people affected = `120`. Type a suggested improvement: `Show a service status banner before payment.` | "I just say how many people it affects and how urgent it is. I can also suggest an improvement; a technician reviews that separately." |
| 5 | **PAUSE on the preview box** (wait ~1 s): *Suggested priority P1 (score 40.5) · Category: Application · respond within 3 min, resolve within 20 min · Recommended technician: Asha Mehta.* Hold 4 seconds. | "Before I even submit, the system has done the thinking. Category Application, detected from my wording. Priority P1: impact 3 times urgency 3 times the payment portal's business criticality 3 is 27, multiplied by 1.5 because more than fifty people are affected, giving 40.5; anything above 18 is P1. The SLA is the payment portal's own stricter target: respond in 3 minutes, resolve in 20. And it already recommends Asha Mehta." |
| 6 | Click **Submit incident**. | "Submit." |
| 7 | Incident page opens. Point at: pills **P1 / Assigned**; the SLA panel; **Priority reasoning**; **Activity timeline** (created → proposal submitted → classified → technician assigned, each with *previous → new state*). | "The incident is created, classified, prioritised, given its SLA and assigned to Asha, all in one step. Every action lands in the activity timeline with the previous and new state; that's our audit trail." |
| 8 | Click **Alerts** (top right) → **Notifications** page. Show the *Technician assigned* row, then click the **Email simulation** tab. | "Notifications: an in-app alert, and a simulated email, so there are two channels. Nothing leaves this computer, but the code behind it is the same as a real integration." |
| 9 | *(optional, 10 s)* Open the **Terminal** page, type `list --mine`. | "Everything is available from a terminal too; same API, same permissions." |

**Do NOT acknowledge this incident.** Workflow 3 needs it untouched.

---

## 5. Segment 4 - WORKFLOW 2: technician investigates → SLA monitored → resolved → user notified (4:25-7:55) · KRISHNA

**Take 2, reset with `npm run demo`.** Goal line on screen: *Workflow 2: Technician investigates → SLA monitored → incident resolved → user notified.*

| # | Tab / action | Say |
|---|---|---|
| 1 | **Tab 1: Maya.** Report `Wi-Fi keeps disconnecting in the library`, service **Campus Wi-Fi**, description `Wireless drops every few minutes on the second floor of the library.`, Impact *A department*, Urgency **Can wait**, people `20`, suggested improvement `Add a wireless coverage map to the student portal.` Preview shows **P3**, SLA 60 / 480, recommended **Ravi Kumar**. Submit. *(about 20 s; speed up in editing)* | "Maya reports a Wi-Fi problem. It comes in as priority P3 and goes to Ravi, whose skills are Network." |
| 2 | **Update + priority change.** Still Maya: **Edit details**, change **Urgency** to *Work is affected*, Save. Pills change **P3 → P2**; timeline shows *Priority changed from P3 to P2*. Point at the SLA deadlines. | "Maya realises it's affecting more than she thought and edits the ticket. The priority is recalculated to P2, and the SLA deadlines with it, from 60 and 480 minutes down to 15 and 120. Employees can only edit before a technician acknowledges; after that the system refuses." |
| 3 | **Tab 2: Ravi.** **Alerts** → *Priority changed*, *Technician assigned*. Open the incident. SLA panel: **On track**, ~120 m left. Show the buttons: **Acknowledge incident**, **Request information**. | "Ravi, the technician, is told about the new priority. His page shows exactly what he can do next; buttons appear only for actions the server will allow." |
| 4 | **Acknowledge incident** → **Acknowledged**. **Start investigation** → **In progress**. | "He acknowledges, which stops the response clock, and starts the investigation. The lifecycle only allows these in order." |
| 5 | In *Conversation & investigation*: type `Switch uplink flapping on access point L2-04`, tick **Internal note**, **Post note**. Then **Request information**: `Which entrance are you closest to?` → pill **Waiting for information**. | "He adds an internal note, visible to support only, and asks Maya a question." |
| 6 | **Tab 1: Maya.** **Alerts** → *More information needed*. Open the incident. Show the *Support needs more information* box and that the **internal note is not in her list**. Reply: `East entrance, third floor.` | "Maya gets the question and replies. She can't see Ravi's internal note: that is enforced on the server, not just hidden on screen." |
| 7 | **Tab 3: admin.** **SLA & assignment**. In *Demo clock & SLA monitor* choose **90 minutes**, **Advance clock**. Result line: *Monitor checked 1 incidents: 1 warnings, 0 violations, 0 escalations.* Open the incident: SLA **At risk** and the *SLA risk* box with reasons. | "Time to show SLA monitoring. I move the demo clock forward 90 minutes. This incident has 120 to resolve, so it's now in its last quarter: the monitor flags it **At risk**, records a warning, and the risk detector explains why." |
| 8 | **Tab 2: Ravi.** **Alerts** → *SLA deadline approaching*. Open the incident, in the **Suggested improvement** box click **Accept proposal**, note `Good idea, adding it to the next sprint.` Then **Provide resolution**: `Replaced the faulty access point and moved clients to the 5 GHz band.` → **Resolved**; SLA **Met**. | "Ravi is warned before the deadline. He accepts Maya's improvement idea, which is reviewed separately from the fix, then resolves the incident with details. Resolved in time, so the SLA becomes **Met**." |
| 9 | **Tab 1: Maya.** Alerts: *Incident resolved*, *Improvement proposal reviewed*. **Verify resolution** → **Verified**. **Tab 2: Ravi** → **Close incident** → **Closed**. **Tab 1** → **Leave feedback**, rating 5, `Fast and helpful`. | "The employee verifies the fix, the technician closes it, and the employee leaves feedback. That's the full lifecycle: report, classify, prioritise, assign, investigate, resolve, verify, close." |
| 10 | *(bonus, 20 s)* **Tab 1: Maya.** Report `Wi-Fi drops in the library again` (Campus Wi-Fi). **Tab 3: admin** opens it → **Suggested resolutions**: the earlier fix at ~96 % match. | "And when a similar problem comes back, the staff view suggests the earlier fix. The system learns from its own history." |

---

## 6. Segment 5 - WORKFLOW 3: duplicates → correlation → escalation (7:55-12:10) · YASHRAJ

**Take 1, continue the same database right after Workflow 1.** (INC-1001 exists, assigned to Asha, un-acknowledged.) Goal line: *Workflow 3: Multiple incidents reported → duplicates / related detected → correlated → escalated.*

| # | Tab / action | Say |
|---|---|---|
| 1 | **Tab: Maya.** Report `Payment transaction failing`, **Payment portal**, `Checkout shows an error when paying the fees online.` Impact *Organization wide*, Urgency *Work is affected*, people `15`. **PAUSE on the preview:** yellow *Possible duplicate: INC-1001 Payment application unavailable (≈83 % similar)*. Submit → **P1**, assigned to **Neha Shah**. | "Now a second person reports the payment problem in different words. Before she even submits, the system has noticed it looks like INC-1001, about 83 % similar, even though the sentences share almost no exact words. It still goes to a different technician, Neha, because the assignment also looks at workload." |
| 2 | **Self-registration.** Sign out. **Register**: `Demo Student`, `student@incidentdesk.test`, `Student123`. You're signed in as a new employee. Report `Unable to make payment`, **Payment portal**, `Every attempt to pay my fees fails at checkout.`, Impact 3, Urgency 2, people `8`. Preview lists **two** possible duplicates. Submit → **P1**. | "A brand-new user registers themselves; self-registered accounts are always employees. They report the same outage a third way. Now two earlier incidents match." |
| 3 | *(optional, 10 s)* **Tab: Jordan.** Resubmit the exact Workflow-1 report → *You already reported something very similar* with **Submit anyway**. | "If the same person reports the same open incident twice, the system stops them: our duplicate-incident exception." |
| 4 | **Admin tab.** **Overview**: *Critical incidents 3*. **Reports** → **Correlated incidents**: *Payment portal: 3 related reports* with the three INC links and the suggestion. | "Three reports about one service within an hour are no longer three separate problems. The correlation engine groups them and tells the admin to look for one root cause." |
| 5 | Open **INC-1002**. Point at **Related incidents** (INC-1001, INC-1003) and, in the timeline, *Possible duplicate of INC-1001*. | "Each ticket shows its related incidents, and the duplicate flag is in the audit trail." |
| 6 | **SLA & assignment.** Choose **3 minutes**, **Advance clock**. Result: *3 warnings, 0 violations, 0 escalations.* | "Nobody has acknowledged these P1s. The payment portal promises a response in 3 minutes. I move the clock three minutes: the monitor warns the technicians and admins." |
| 7 | **1 minute**, **Advance clock**. Result: *0 warnings, 3 violations, 3 escalations.* Open INC-1001: badge **Escalated to Team Lead**, SLA **Breached**. | "One minute later the deadline is missed. Three violations are recorded, once each, and the incident is escalated automatically to the Team Lead." |
| 8 | **3 minutes** → **Escalated to System Administrator**. Again **3 minutes** → **Escalated to IT Manager**. (Say the ladder as it changes.) | "Still no answer, so it climbs: System Administrator, then the IT Manager. Technician, Team Lead, System Administrator, IT Manager: the chain from the brief." |
| 9 | **Reports**: *SLA risk* list (all three *breached*), *Recorded SLA violations* table (3 rows with times). | "The reports page lists the violations and the incidents at risk." |
| 10 | **Tab: `lead` (Team Lead)** or **`manager`**: **Alerts** shows several *Incident escalated* rows. | "And the people escalated to have been notified." |
| 11 | **Audit log**: filter incident `INC-1001`. Show rows like *Escalated to Team Lead Priya Nair (level 1)* and the **Previous → New** column. | "Every automatic action is in the audit log: who, what, previous state, new state." |
| 12 | *(optional)* **Tab: Asha** → open INC-1001 → **Acknowledge incident**. Advance 3 min as admin: no further escalation. | "Once a technician acknowledges, escalation stops." |

---

## 7. Segment 6 - LIVE SIMULATION: the same 8 incidents, two strategies (12:10-13:40) · KRISHNA

This is the proof that the assignment strategy is really swappable. **Two takes on an empty system, edited together.** Layout: browser on the left (**Overview** with *Team workload*), terminal on the right.

**Take 3a** (`npm run demo`):

| # | Do this | Say |
|---|---|---|
| 1 | Admin → **SLA & assignment** → *Assignment strategy*: **Least loaded**. | "The system is empty and I've chosen the least-loaded strategy. Now I'll throw eight realistic incidents at it, through the real API, from two different employees." |
| 2 | In the terminal run `npm run simulate`. Lines scroll: `INC-1001 P3 Office workstation jordan -> Neha Shah` … Last line: **Assigned per technician: 2 · 2 · 2 · 2**. | "Eight incidents, different services, different priorities. Each one is validated, prioritised, given an SLA and assigned." |
| 3 | Browser → click **Overview** → *Team workload* bars: **all four at 2**. | "Least loaded spreads the work perfectly evenly: two each." |

**Take 3b** (`npm run demo` again, strategy **Experience based**, same command):

| # | Do this | Say |
|---|---|---|
| 4 | Same steps. Result: **Priya Nair 6 · Neha Shah 2**. Overview: Priya's bar full (**6/6 active**). | "Same eight incidents, different strategy: experience-based. Now the most senior engineer, Priya, takes six of them, right up to her maximum workload, and the rest overflow to someone else. Neither strategy is 'right': that's the point. The administrator picks the policy, and nothing in the code changed." |

*Other results if you want a third beat (optional): Skill based → Neha 3, Ravi 2, Asha 2, Priya 1; Round robin → Neha 2, Priya 3, Asha 2, Ravi 1.*
*Capacity note: the four technicians can hold 20 active incidents in total. Run `npm run simulate` more than twice without a reset and the extra incidents are left **unassigned**, which is also real behaviour (admins are alerted).*

---

## 8. Segment 7 - Admin tour: search, services, people, SLA, reports, audit (13:40-15:10) · SHOURYA

**Take 1, admin tab, same database.** About 15 seconds per page. Goal: show the admin requirements in the brief (manage users, technicians, services, SLA policies, categories, assignment strategies, monitor, reports, audit).

| # | Page / action | Say |
|---|---|---|
| 1 | **Incidents**: use the filters one after another - search `payment`, **Priority** P1, **Status** Assigned, **Service**, **Category**, **Technician**, **SLA status** Breached, date **From/To**; tabs All / Open / Resolved; **Clear**. | "Search and filtering: free text or incident ID, priority, status, category, service, technician, SLA status and a date range, more than the five the brief asks for." |
| 2 | **IT services**: show cards with criticality and open counts; **Add category** → `Telephony`, keywords `phone, voip` → Save. | "Services and categories are data, not code. Adding a category needs no change anywhere else, and its keywords immediately feed the automatic category suggestion." |
| 3 | **People**: roles, a technician's skills and workload; **Edit** a technician to show availability and max workload. | "Admins manage users, technician skills, availability and maximum workload. Deactivating a technician who still has active work is refused." |
| 4 | **SLA & assignment**: default targets table (P1 5/30 … P4 240/1440) and *Service-specific targets* (Payment portal P1 3/20). Switch **Priority calculation** to *Rule based* and back. | "SLA policies are configurable per priority and per service. Even the priority algorithm can be switched live." |
| 5 | **Reports**: scroll the page (totals, SLA compliance, mean time to resolve, by service, by category, last 7 days, workload). **Export incidents CSV**. | "Dashboards give totals, SLA compliance, mean time to resolve, workload per technician, service and category breakdowns, and a CSV export." |
| 6 | **Audit log** (filter by action) and **Knowledge base** (expand an article). | "A complete audit log, and a knowledge base built from resolved incidents." |

---

## 9. Segment 8 - Under the hood: architecture, code and live proofs (15:10-17:10) · KRISHNA, then YASHRAJ

### 9a. Architecture and code (Krishna, ~1:20)
**Screen:** **slide 4** (the only content slide in the video; press → 7 times, about 25 s: a dot travels the six layers, then the event bus lights up). Then **4 short code shots** in your editor, ~12 s each, large font, the named thing centred.

> **KRISHNA:** *(slide 4)* One request, followed end to end. The browser, terminal and command line all talk to one HTTP API. It authenticates the user. Use-case services run each action in a database transaction. The domain model holds the real rules. Repositories are the only code that touches SQL. And every change raises an event that two observers pick up: one writes the audit trail, the other sends notifications.

| Code shot | File → what to show | Say |
|---|---|---|
| A | `backend/domain/states.js` - `IncidentState` and the `ResolvedState` constructor (`{ Verified: …, "In progress": … }`) | "State pattern: each lifecycle stage is a class that knows which stages may follow and what permission is needed. No giant if-statements." |
| B | `backend/domain/Incident.js` - the `#p` / `#state` private fields and the `resolve()` method | "Encapsulation: the incident's state is private. The only way to change it is through methods like resolve, which check who's asking, validate, move the state and raise an event." |
| C | `backend/domain/assignment.js` - `AssignmentStrategy` and `RoundRobinStrategy` | "Strategy and polymorphism: four assignment algorithms behind one interface. That's what you just saw swap live." |
| D | `backend/events.js` (`EventBus`) and `backend/notifications/notifications.js` (`NotificationObserver`) | "Observer: the domain raises events and has no idea who's listening. That's why every action showed up in the audit trail and the notifications without the domain knowing either exists." |
| *(opt.)* E | `backend/domain/users.js` (`User` → `Technician`, `UserFactory`) and `backend/errors.js` | "Inheritance where it's a true is-a, a factory for users, and a typed exception hierarchy." |

*(The Repository pattern, interfaces, composition and collections are named in the voiceover: "…and there's a repository layer, abstract interfaces, composition and collections, all in the code.")*

### 9b. Live proofs (Yashraj, ~0:40) - terminal, then the real server restart
Use the helper from section 13 (`login`, `$A`, `$J`).

**Proof 1 - the lifecycle can't be skipped (real API):**
```bash
curl -s -X POST localhost:4173/api/incidents/1003/close -H "Authorization: Bearer $A"
```
Output: `{"error":"An incident that is Assigned cannot move to Closed.","code":"INVALID_STATE_TRANSITION","details":{"from":"Assigned","to":"Closed","allowed":["Acknowledged"]}}`

> **YASHRAJ:** "Even an administrator can't skip the lifecycle. I'm asking the live server to close an incident that was only just assigned. It refuses, and tells me the only legal next step is Acknowledged."

*(Use an incident that is still Assigned. In Workflow 3's database that is INC-1003 only if you did not acknowledge it in optional step 12; otherwise pick any Assigned incident.)*

**Proof 2 - persistence (do this LAST in Take 1):** `Ctrl+C` the server, then restart it **without** resetting the database:
```bash
INCIDENT_DESK_DB=.local-data/demo-clean.sqlite npm start
```
Reload the browser, sign in as admin: the incidents, escalation badges and audit log are all still there.

> **YASHRAJ:** "Everything is stored in a real SQLite database. I'll stop the server completely and start it again. Sign in: every incident, every escalation, the whole audit trail is still here."

---

## 10. Segment 9 - Security, errors, tests, terminal client (17:10-18:20) · YASHRAJ

**Screen:** a real terminal. Use the helper from section 13 (password set off camera).

```bash
curl -s localhost:4173/api/admin/users -H "Authorization: Bearer $J"       # an employee asking for admin data
curl -s localhost:4173/api/incidents/1002 -H "Authorization: Bearer $J"    # someone else's incident
curl -s localhost:4173/api/incidents                                         # no sign-in at all
curl -s -X POST localhost:4173/api/incidents -H "Authorization: Bearer $J" -H 'Content-Type: application/json' \
  -d '{"title":"x","description":"y","serviceId":1,"impact":9,"urgency":1}'   # invalid input
for i in 1 2 3 4 5 6; do curl -s -X POST localhost:4173/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"nobody@incidentdesk.test","password":"wrong-pass-1"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["code"])'; done
```
Expected, in order: `FORBIDDEN` · `INCIDENT_NOT_FOUND` · `AUTHENTICATION_FAILED` · `INVALID_INPUT` · five × `AUTHENTICATION_FAILED` then **`TOO_MANY_ATTEMPTS`**.
(Use an unknown email for the lock-out, not a real account.)

Then `npm test` (about a second) and let the **`ℹ pass 55`** line sit on screen for 2 seconds. Then *(optional)* `npm run cli` → sign in → `list --priority P1` → `exit`.

> **YASHRAJ:** "Security is enforced on the server, not the screen. An employee calling an admin endpoint directly: refused. Asking for someone else's incident: it simply doesn't exist for them. No sign-in: refused. Garbage input: rejected with a clear message. And six wrong passwords in a row: locked out. Every failure case the brief lists, from invalid login to invalid transition to database failure, is a typed error with a clean message.
> And we test all of it. Fifty-five automated tests cover normal operation, boundary values like the SLA thresholds, invalid input, exceptions, authorisation, and business rules like the escalation ladder. They even check that every colour palette meets accessibility contrast.
> *(CLI)* There's also a real command-line client with its own login."

---

## 11. Segment 10 - Roles and look & feel (18:20-18:50) · SHOURYA

**Screen (Take 4, `npm run demo:rich`):** the three tabs side by side or flipped (employee / technician / admin: different menus and buttons); click **Appearance**: **Dark**, then **Forest → Sunset → Graphite → Harbor**; shrink the browser to phone width for 3 seconds; hover buttons and the sidebar.

> **SHOURYA:** Three different views for three roles: each person only sees what they can do. Five colour palettes in light and dark, each checked against accessibility contrast. Animations that respect the reduced-motion setting, and a layout that works on a phone. And beyond the brief, the intelligent features are rule-based and explainable: duplicate detection, correlation, automatic escalation, SLA-risk prediction, technician recommendation and suggested resolutions.

---

## 12. Segment 11 - Closing (18:50-19:20) · ALL

**Screen:** webcam, three quick shots (optionally a 3-second shot of the app behind).

> **KRISHNA:** From a single report to a closed incident, every step is enforced, recorded and visible.
> **YASHRAJ:** The whole system is object-oriented, tested, and ready to scale.
> **SHOURYA:** Thanks for watching: Shourya…
> **KRISHNA:** …Krishna…
> **YASHRAJ:** …and Yashraj.

---

## 13. Copy-paste text and terminal helper

Keep this section open on a second screen.

**Terminal helper (paste once, off camera, before recording the terminal segments):**
```bash
export PW='<demo password from backend/seed.js>'
login(){ curl -s -X POST localhost:4173/api/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$1@incidentdesk.test\",\"password\":\"$PW\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'; }
A=$(login admin); J=$(login jordan)
```

**Text to type:**
```
W1  title: Payment application unavailable
    desc : Users are unable to complete transactions in the payment application.
    idea : Show a service status banner before payment.
    pick : service Payment portal · Impact Organization wide · Urgency Work has stopped · people 120

W2  title: Wi-Fi keeps disconnecting in the library
    desc : Wireless drops every few minutes on the second floor of the library.
    idea : Add a wireless coverage map to the student portal.
    pick : service Campus Wi-Fi · Impact A department · Urgency Can wait · people 20   (→ edit Urgency to "Work is affected")
    note : Switch uplink flapping on access point L2-04   [Internal note]
    ask  : Which entrance are you closest to?
    reply: East entrance, third floor.
    accept proposal note: Good idea, adding it to the next sprint.
    fix  : Replaced the faulty access point and moved clients to the 5 GHz band.
    feed : rating 5 - Fast and helpful
    again: Wi-Fi drops in the library again     (same service, any impact)

W3a title: Payment transaction failing
    desc : Checkout shows an error when paying the fees online.
    pick : Payment portal · Impact Organization wide · Urgency Work is affected · people 15      (Maya)
W3b register: Demo Student / student@incidentdesk.test / Student123
    title: Unable to make payment
    desc : Every attempt to pay my fees fails at checkout.
    pick : Payment portal · Impact Organization wide · Urgency Work is affected · people 8
```
*Do not re-register `student@…` twice in one database; "That value already exists" means reset with `npm run demo`.*

### Clock-step cheat sheet (Workflow 3, payment P1: respond in 3 min)

| Press | Result line | Visible on the incident |
|---|---|---|
| **3 min** | 3 warnings · 0 violations · 0 escalations | SLA **At risk** |
| **1 min** | 0 warnings · 3 violations · 3 escalations | **Escalated to Team Lead** · **Breached** |
| **3 min** | 0 · 0 · 3 | **Escalated to System Administrator** |
| **3 min** | 0 · 0 · 3 | **Escalated to IT Manager** |

*(Workflow 2: one press of **90 minutes** → 1 warning, SLA **At risk**, then resolve → **Met**.)*

---

## 14. Rubric & brief checklist (tick while editing)

| Rubric | Marks | Where the video proves it |
|---|---|---|
| Functionality - MVP modules | 60 | Segments 3-7: three workflows, simulation, admin tour |
| Technical depth | 15 | Segments 6, 8, 9: strategies, patterns in code, API, security |
| Design & architecture | 10 | Segments 2, 8 (+ report) |
| User experience | 10 | Three role views (3, 4, 10), live preview, action buttons, palettes |
| Innovation | 10 | Escalation, similarity, correlation, risk prediction, event-driven, CLI (5, 10) |
| Testing & validation | 5 | Segment 9 (`npm test` 55 pass, real error responses), edit-after-ack refusal (4), duplicate guard (5) |
| Documentation & presentation | 10 | Intros, clear workflow titles, one architecture picture (+ report by your teammate) |

| MVP item in the brief | Shown in |
|---|---|
| Users: employee / technician / administrator | 3, 4, 7, 10 |
| Incident create / view / update / assign / resolve / close | 3, 4 (update = Edit details), 6 and 7 (assign) |
| Priority from impact, urgency, business criticality (+ users affected) | 3 (preview) |
| ≥ 2 assignment strategies | 6 (live, 2 compared), 8 (code) |
| SLA calculation, deadline tracking, violation detection, warnings, recording | 4, 5 |
| ≥ 2 notification mechanisms | 3 (in-app + email simulation) |
| Complete audit history | 3, 5, 7 |
| ≥ 5 search/filter criteria | 7 |
| ≥ 2 intelligent features | 4 (suggested resolution), 5 (duplicates, correlation, escalation, risk) |
| Persistence | 8 (real restart) |
| Brief's 3 example workflows | 3, 4, 5 exactly as titled |
| ≥ 2 design patterns | 8 (State, Strategy, Observer, + named Factory, Repository) |
| Each member introduces themselves + explains a module | 1 (and each person's own segments) |

---

## 15. If something goes wrong on camera

| Problem | Fix |
|---|---|
| `EADDRINUSE: 4173` | Another copy is running. `pkill -f "node.*server.js"` then `npm run demo`. |
| "That value already exists" on Register | Demo database wasn't reset. `Ctrl+C`, `npm run demo`, redo the take. |
| Escalation jumped straight to IT Manager | You pressed a big step. Reset and use 3 → 1 → 3 → 3. |
| Workflow 2 incident shows **Breached** | You used the same database as Workflow 3. Reset and redo Take 2. |
| Simulation shows "unassigned" lines | The technicians are full (20 active in total). Reset with `npm run demo` before each simulation. |
| Alerts count hasn't updated | Pages refresh every 8 s. Click **Alerts** or the page name. |
| Preview box says nothing | Title ≥ 5 chars and description ≥ 10 chars are required before it appears. |
| Employee can't see *Related incidents* | Correct: that panel is staff-only. Use the admin tab. |
| Sign-in fails after a restart | Sign in again; browser sessions don't carry over a restart reliably. |
| Terminal helper says `parse error` / empty token | `PW` not set, or the server isn't up. Re-run the helper lines. |

---

## 16. The two slides you use (`docs/video/slides.html`)

Keys: **→ / Space** next step · **←** back · **F** fullscreen · **H** hide the progress HUD (do this before recording) · open `slides.html?slide=4&step=0` to start on a slide.

| Slide | Use | Presses | What animates |
|---|---|---|---|
| 1 Title | optional 4 s card at the very start | 3 | title, subtitle, names |
| 4 Architecture | segment 8a | 7 | request dot travels the layers, event bus lights up |

The other 12 slides (problem, rubric, tech choices, state machine, OOP map, patterns, intelligent features, SLA timeline, security, testing, innovation, closing) exist if you want a backup visual for a specific moment, but **the plan does not need them**: the real app and terminal do that work.
