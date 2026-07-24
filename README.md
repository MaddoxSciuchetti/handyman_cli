# Handyman CLI

## Problem

Small service businesses, such as HVAC companies, cannot easily be discovered by
AI agents. Their websites often do not provide enough structured information for
agents to understand their services or book work on behalf of people.

Handyman CLI lets every small HVAC business create and publish its own custom
CLI. Other agents can discover the business, understand its services, and book
it directly through the CLI.

## How it works

### 1. Analyze the business website

Enter the business website. Handyman CLI searches it and extracts the services
and service areas already listed online.

![Enter the business website](images/Screenshot%202026-07-23%20at%2018.36.45.png)

![Handyman CLI analyzing the website](images/Screenshot%202026-07-23%20at%2018.37.04.png)

### 2. Complete a short phone interview

The owner receives a call to fill in missing details such as pricing,
availability, and booking requirements.

![Enter a phone number for the owner interview](images/Screenshot%202026-07-23%20at%2018.37.22.png)

![Owner interview in progress](images/Screenshot%202026-07-23%20at%2018.37.28.png)

> **Live demo:** This is a real, working phone call—not a simulated flow. Enter
> a real phone number and the AI interviewer will call it.

### 3. Review the business profile

Review the combined website and interview data, then choose the business's CLI
command.

![Review the generated business profile](images/Screenshot%202026-07-23%20at%2018.38.28.png)

### 4. Publish and use the CLI

Publish the custom CLI so agents can discover the business, inspect its
services, and book it with structured commands.

![Published CLI and its available commands](images/Screenshot%202026-07-23%20at%2018.38.35.png)

![Using the published CLI in a terminal](images/Screenshot%202026-07-23%20at%2018.38.46.png)

## Tech used

- **Octen** searches and extracts service information from the business website.
- **OpenAI** turns the extracted data into a structured business profile.
- **Vapi** runs the AI phone interview with the business owner.
- **Twilio** provides the phone number and telephony layer for the call.

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
