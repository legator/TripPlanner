# TripPlanner — Code & Workflow Diagrams

---

## 1. System Architecture

```mermaid
graph TD
    subgraph Client["Browser / Capacitor App"]
        UI["page.tsx<br/>state + handlers"]
        Sidebar["Sidebar"]
        MapView["MapView / HereMapView"]
        DrivingHUD["DrivingHUD"]
        MapSDK["GoogleMapsProvider<br/>HereMapsProvider"]
    end

    subgraph ClientLib["src/lib  (client)"]
        TPC["tripPlannerClient.ts"]
        Storage["tripStorage.ts"]
        SavedTrips["savedTrips.ts"]
        ShareLib["tripShare.ts"]
        ApiTracker["apiTracker.ts"]
        Location["location.ts"]
        RouteProgress["routeProgress.ts"]
        DriveSession["driveSession.ts"]
    end

    subgraph API["Next.js API Routes"]
        PlanRoute["/api/plan"]
        ShareRoute["/api/share"]
        QuotaRoute["/api/quota"]
    end

    subgraph ServerLib["src/lib  (server)"]
        TripPlanner["tripPlanner.ts"]
        Validation["validation.ts"]
        RedisClient["redisClient.ts"]
        QuotaGuard["hereQuotaGuard.ts"]
        EVPlanner["evPlanner.ts"]
    end

    subgraph Providers["Map Provider Abstraction"]
        ProviderIndex["providers/index.ts"]
        GoogleProv["providers/google.ts"]
        HereProv["providers/here.ts"]
    end

    subgraph External["External Services"]
        GoogleAPI["Google Maps Platform"]
        HereAPI["HERE Maps Platform"]
        Upstash["Upstash Redis"]
        OpenMeteo["Open-Meteo"]
    end

    UI --> TPC & Storage & SavedTrips & ShareLib & Location & DriveSession
    UI --> Sidebar & MapView & DrivingHUD
    MapView --> MapSDK
    DrivingHUD --> RouteProgress

    TPC -->|POST /api/plan| PlanRoute
    ShareLib -->|POST GET /api/share| ShareRoute

    PlanRoute --> Validation & RedisClient & TripPlanner
    TripPlanner --> ProviderIndex & EVPlanner & QuotaGuard
    QuotaGuard --> RedisClient

    ProviderIndex --> GoogleProv & HereProv
    GoogleProv --> GoogleAPI
    HereProv --> HereAPI
    RedisClient --> Upstash
```

---

## 2. Trip Planning Pipeline

```mermaid
sequenceDiagram
    actor User
    participant UI as page.tsx
    participant C as tripPlannerClient
    participant R as /api/plan
    participant V as validation.ts
    participant Redis as redisClient
    participant P as tripPlanner.ts
    participant Prov as google/here provider
    participant Ext as Google Maps / HERE API

    User->>UI: clicks Plan Trip
    UI->>UI: setIsPlanning(true)
    UI->>C: planTripRequest(waypoints, settings, provider)
    C->>R: POST /api/plan

    R->>Redis: INCR rl:plan:{ip}
    Redis-->>R: count ok

    R->>V: validateWaypoints(body.waypoints)
    V-->>R: null

    R->>V: validateAndClampSettings(body.settings)
    V-->>R: settings clamped

    R->>P: planTrip(waypoints, settings, provider)

    P->>Prov: getRoute(origin, dest, intermediates)
    Prov->>Ext: Directions / Route API
    Ext-->>Prov: legs + polylines
    Prov-->>P: RouteResult

    P->>P: groupLegsIntoDays()

    loop Each day in parallel
        P->>Prov: searchNearby x7 via Promise.all
        Prov->>Ext: Places / Browse API
        Ext-->>Prov: nearby places
        Prov-->>P: gas, hotels, restaurants...
        P->>P: buildDaySchedule()
    end

    P->>P: insertRestDays()
    P->>P: rollupCosts()
    P-->>R: TripPlan

    R-->>C: 200 TripPlan JSON
    C->>C: recordApiCall()
    C-->>UI: TripPlan
    UI->>UI: setTripPlan + setIsPlanning(false)
    UI-->>User: itinerary rendered
```

---

## 3. API Request Lifecycle

```mermaid
flowchart TD
    A([POST /api/plan]) --> B{IP rate limited?}
    B -->|yes| C[429 Too Many Requests]
    B -->|no| D[Parse JSON body]
    D --> E{validateWaypoints}
    E -->|invalid| F[400 Bad Request]
    E -->|valid| G{validateAndClampSettings}
    G -->|invalid| H[400 Bad Request]
    G -->|valid| I[Resolve provider]
    I --> J{API key present?}
    J -->|missing| K[500 Not configured]
    J -->|ok| L[planTrip]
    L --> M{HERE quota exceeded?}
    M -->|yes| N[429 Quota Exceeded]
    M -->|no| O[External API call]
    O --> P{Error in response?}
    P -->|rate limit keyword| Q[429 RATE_LIMIT_EXCEEDED]
    P -->|other error| R[500 PLAN_ERROR]
    P -->|success| S[200 TripPlan JSON]
```

---

## 4. Map Provider Strategy

```mermaid
flowchart TD
    A([App mount]) --> B{localStorage<br/>stored provider?}
    B -->|yes| C[Use stored choice]
    B -->|no| D{NEXT_PUBLIC_MAP_PROVIDER<br/>env set?}
    D -->|yes| E[Use env value]
    D -->|no| F[Show MapProviderPicker]
    F --> G([User picks Google or HERE])
    G --> H[storeMapProvider to localStorage]

    C & E & H --> I{Provider}

    I -->|google| J["GoogleMapsProvider<br/>Maps JS SDK"]
    I -->|here| K["HereMapsProvider<br/>HERE Maps JS SDK"]

    J --> L[MapView.tsx]
    K --> M[HereMapView.tsx]
    J --> N[PlaceAutocomplete.tsx]
    K --> O[HerePlaceAutocomplete.tsx]

    subgraph Server["Server side"]
        I2{Provider in POST body}
        I2 -->|google| P[providers/google.ts]
        I2 -->|here| Q[providers/here.ts]
    end
```

---

## 5. Driving Mode State Machine

```mermaid
stateDiagram-v2
    [*] --> Idle : app load

    Idle --> Planning : handlePlanTrip
    Planning --> Idle : error
    Planning --> Planned : TripPlan received

    Planned --> Planning : re-plan / add stop
    Planned --> Driving : handleStartDriving

    Driving --> Rerouting : off-route deviation
    Rerouting --> Driving : new polyline applied
    Rerouting --> Driving : reroute error, keep old route

    Driving --> Planned : handleExitDriving

    note right of Driving
        Wake lock held
        GPS watch active
        Android notification live
        driveSession in localStorage
    end note
```

---

## 6. Data Persistence and Sharing

```mermaid
flowchart LR
    subgraph State["React State"]
        WP[waypoints]
        ST[settings]
        TP[tripPlan]
    end

    subgraph LS["localStorage"]
        LS1["tripplanner_saved<br/>auto-save"]
        LS2["tripplanner_saved_trips<br/>named trips, max 20"]
        LS3["active_drive_session<br/>12h TTL"]
        LS4["api_tracker_v1<br/>health stats"]
        LS5["map_provider<br/>google or here"]
    end

    subgraph URLs["URL / Clipboard"]
        HASH["hash trip=base64<br/>full payload"]
        SHORT["query share=id<br/>short link"]
    end

    subgraph Redis["Upstash Redis"]
        RL["rl:plan:{ip}<br/>rate limit, 60s TTL"]
        QT["here:usage:total<br/>monthly quota"]
        TR["trip:{id}<br/>shared payload, 30d TTL"]
    end

    WP & ST & TP -->|debounced 400ms| LS1
    LS1 -->|on mount| WP & ST & TP

    TP & WP & ST -->|encodeTripToURL| HASH
    HASH -->|decodeTripFromURL on mount| WP & ST & TP

    TP & WP & ST -->|POST /api/share| TR
    TR -->|GET /api/share| WP & ST & TP
    SHORT -.->|share param on mount| TR

    WP & ST & TP -->|saveTrip| LS2
    LS2 -->|handleLoadSavedTrip| WP & ST & TP
```

---

## 7. HERE Quota Guard Flow

```mermaid
flowchart TD
    A([HERE API call]) --> B["checkAndIncrementHereQuota<br/>service, count"]
    B --> C{Redis available?}

    C -->|yes| D["mget totalKey + serviceKey"]
    D --> E{total + count > 29500?}
    E -->|yes| F[throw HereQuotaExceededError]
    E -->|no| G{service + count > limit?}
    G -->|yes| F
    G -->|no| H["pipeline: INCRBY + EXPIRE x2"]
    H --> I[return remaining]

    C -->|no or error| J["localUsageStore on globalThis"]
    J --> K{same limit checks}
    K -->|exceeded| F
    K -->|ok| L[increment local counters]
    L --> I

    I --> M([Proceed with HERE API call])

    F --> N[429 to client]
```
