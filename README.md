# Insolve Server Application

This is the core of the [Insolve™ White Label Solution](https://insolve.gg). It provides all functionality for an online iGaming business aswell as allows for easy addition of custom made solutions. The frontend bridge is located in [Insolve™ Framework](https://github.com/theneuetimes/insolve-v2-framework).

## Functionality

TBA

## Folder structure / Architecture

TBA

## Interfaces

TBA

## Event system

One of the most important aspects that allows for easy customization of the platform is the event system. There is hundreds of them that combined with the previously mentioned interfaces provide grounds to integrate any new gamemode or functionality into the system.

To start using it, simply import the `events` interface and start listening to events.

```js
const events = require("@/interfaces/events");

events.on("transactions:new-deposit-steam", (data) => {
  console.log(`User ${data.user} requested a new deposit for ${data.value}`);
});
```

Full list of available events is documented [here](https://github.com/theneuetimes/insolve-v2/docs/EVENTS.md).

## Available scripts

```
npm start
```

Launches the server in production mode.

```
npm run start:dev
```

Launches the development version of the server. Includes more debug statements and will use the development config.

## Available flags

`--no-bot` Will launch the server without signing into the bot accounts.

`--no-games` Will overwrite config and disable all games.
