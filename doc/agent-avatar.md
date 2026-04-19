# Agent avatar (upload og offentlig URL)

## Datamodel

- `agents.avatar_asset_id` — FK til `assets` (blob i konfigureret storage).
- `agents.avatar_access_token` — unikt, hemmeligt token (ikke session-baseret); bruges kun i den offentlige avatar-URL.

`icon` (Lucide-preset) bevares som fallback i UI når der ikke er uploadet avatar.

## API

| Metode | Sti | Beskrivelse |
|--------|-----|-------------|
| `POST` | `/api/agents/:id/avatar` | Multipart upload (`image/png`, `image/jpeg`, `image/webp`), max. størrelse og resize via **sharp** (JPEG-output, metadata strip). Kræver samme auth som øvrige agent-mutationer. |
| `DELETE` | `/api/agents/:id/avatar` | Fjerner avatar og sletter tilknyttet asset hvor det er muligt. |

Agent-responser, der eksponeres til UI og plugins, inkluderer **`avatarUrl`**: en relativ sti `/api/public/agent-avatars/<token>` som klienten kan gøre absolut med deployment-origin.

## Offentlig GET (uden login)

- `GET /api/public/agent-avatars/:accessToken`
- Ingen cookie/session; adgang kun hvis `accessToken` matcher en række med aktiv `avatar_asset_id`.
- `Cache-Control: public, max-age=3600` (kan justeres efter sikkerhed/performance).

Slack og andre integrationer skal bruge den **fulde HTTPS-URL** (fx `https://<host>/api/public/agent-avatars/<token>`). Tokens bør betragtes som hemmelige, men ikke som kortlivede sessions — roter ved fjernelse/upload af ny avatar.

## Sikkerhed og drift

- Begræns filstørrelse og MIME-typer på upload (server).
- Rate limiting følger øvrige API-ruter på agent-endpoints.
- Ved datalæk: nulstil avatar (`DELETE`) for at invalidere token og slette blob afhængigt af storage-implementering.
