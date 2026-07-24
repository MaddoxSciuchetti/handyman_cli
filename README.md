# Handyman CLI

Turn a handyman website and owner interview into a local command-line tool.

## Setup

```sh
cp .env.example .env
npm install
npm run dev
```

The onboarding app runs at `http://localhost:3000`. The local API runs at
`http://127.0.0.1:8788`.

For Vapi webhooks, expose the local API:

```sh
ngrok http 8788
```

Set the resulting HTTPS URL as `PUBLIC_BASE_URL`.

## Environment

```dotenv
OCTEN_API_KEY=
OPENAI_API_KEY=
VAPI_API_KEY=
VAPI_PHONE_NUMBER_ID=
PUBLIC_BASE_URL=
```

Without provider credentials, the app runs the complete flow in demo mode.

## Generated commands

```sh
<business> help
<business> jobs
<business> job "job name"
<business> price "job name"
<business> areas
<business> availability
<business> contact
<business> profile
```

Add `--json` to any command for machine-readable output.
