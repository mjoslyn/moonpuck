---
title: Setting up with an AI agent
description: "Have a coding agent such as Claude Code set up a new site for you: what you need, what to do yourself, and a prompt to copy."
sidebar:
  order: 0.5
---

A coding agent (such as Claude Code) can do the technical part of setting up a new site: copying the
code, making the site its own, putting it on Cloudflare and checking it works. You answer its questions,
sign in to your accounts when it asks, and do the few steps that need you.

## Before you start

You need:

- A computer with **Node 22.12** or later and **git**. The agent can check this and tell you what to
  install.
- A **GitHub** account, for the site's own copy of the code.
- A **Cloudflare** account on the **Workers Paid** plan, with **Cloudflare Images** turned on.
- The site's **domain** (such as `example.org`), added to Cloudflare.
- Your organization's name, a short description of what it does, and the email address the site
  sends from.

Optional, and only for the features you want: an Anthropic key (Compose), Stripe or Square (payments),
Mailgun (mailing lists) and Shippo (shipping). You add these yourself later, in **Settings > Connections**
(see [Connections](/admins/connections/)). Never paste a key into the chat with the agent.

## What you do yourself

- **Sign in** when the agent opens a Cloudflare or GitHub sign-in page in your browser.
- **Answer its questions**: the site's name, its address, which features you want.
- **Make the first admin**: open `/admin/` on the new site and fill in the form with the **Setup code**
  the agent gives you (see [Making the first admin](/admins/#a-new-site-making-the-first-admin)).
- **Connect services** under **Settings > Connections**.
- **Turn features on** under **Settings** (see [Turning features on](/admins/features/)).

## The prompt

Open your coding agent in an empty folder, then copy this prompt and paste it in. Change the lines in
**Site details** first, or leave them and the agent will ask.

```text
Set up a new moonpuck website for me and put it online on Cloudflare. moonpuck is an
open source CMS: https://github.com/mjoslyn/moonpuck. I am not a developer, so explain
each step in plain words, ask before anything that creates or changes something in one
of my accounts, and stop and ask me when you are not sure.

Site details (ask me for any that are blank):
- Organization name:
- What it does, in one or two sentences:
- Site address (domain):
- Email address the site sends from:
- Time zone:
- Features I want (events, tickets, members, mailing lists, shop, donations):

Steps:
1. Check that Node 22.12 or later and git are installed. If not, tell me how to install them.
2. Clone the repository into a folder named after the site. Rename the `origin` remote
   to `upstream`, make a new private GitHub repository for the site (ask me first), and
   add it as `origin`.
3. Read README.md, AGENTS.md and CORE.md. Follow them, not your own memory.
4. Run `npm install` and `npm run setup -- --no-dev`. Then start the dev server and
   check that http://localhost:4321 loads.
5. Make the site its own in `src/site/`: the name, organization, admin email, time zone,
   mail sender and the Compose brief in `config.ts`. Keep the example content types
   unless I ask for others. Replace AGENTS.md with short notes about this site that keep
   `@CORE.md` as the first line. Run `npm run check`, `npm run build` and `npm test`,
   and fix anything that fails.
6. Commit and push to `origin`.
7. Put it on Cloudflare, following README.md's Hosting section:
   - Run `npx wrangler login` and wait while I sign in.
   - Give the Worker, database, bucket and queue names of the site's own in
     `wrangler.jsonc`, then create the D1 database, R2 bucket and queue, put the
     database id in `wrangler.jsonc` and apply the migrations with `--remote`.
   - Add the `EMAIL` binding for Cloudflare Email Service and tell me how to onboard
     the sender's domain under Email Sending in the dashboard.
   - Set `SITE_URL` and `MAIL_FROM` as vars. Set `AUTH_SECRET` as a secret (a new random
     value of `openssl rand -hex 32`; don't show it to me). Set `SETUP_CODE` as a secret
     too, a random code you then tell me, so I can make the first admin.
   - Run `npm run deploy`, then tell me how to add my domain to the Worker
     (Domains & Routes) and, if I want, how to deploy from git with Workers Builds.
8. Open the site's address and its /admin/ page to check they load. Tell me the
   Setup code and to tick "Add starter content" when I make my account.
9. Finish with a short list: what you did, what is left for me (connecting services
   under Settings > Connections, turning features on under Settings), and the link to
   the Admin guide: https://moonpuck.com/admins/

Rules:
- Never ask me to paste API keys or passwords into this chat. Service keys go in the
  site's Settings > Connections, which I do myself.
- Don't change files outside `src/site/`, AGENTS.md, README.md, `.env` and
  `wrangler.jsonc`, so core updates stay easy to take.
- Don't delete anything in my Cloudflare or GitHub accounts.
```

## After the agent is done

1. Open `/admin/` on your site and make your account with the **Setup code**.
2. Connect the services you need under **Settings > Connections**.
3. Turn on the features you want under **Settings**, and set the look under **Settings > Theme**.
4. Invite editors under **People > Users** (see [People and access](/admins/people/)).

:::tip
Keep the folder the agent made. When moonpuck has updates, ask the agent to "take the core updates
with `npm run core:update` and deploy", in the same folder.
:::
