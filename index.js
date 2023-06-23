const compression = require('compression');
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const express = require('express');
const passport = require('passport');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { isProd } = require('./helpers');
const { scheduleBackup } = require('./scripts/backup');
const reactAuthMiddleware = require('./middlewares/beta_auth');
const closedBetaMiddleware = require('./middlewares/closed_beta');
const unless = require('./middlewares/unless');

const config = require('./config');

const app = express();

const limiter = rateLimit({
	windowMs: 10 * 1000, // 1 min
	max: 60, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use(express.json());
app.use(compression());
app.use(session({secret: config.auth.sessionSecret, name: config.auth.sessionName, resave: true, saveUninitialized: true}));
app.use(passport.initialize());
app.use(passport.session());
// app.use(cors({origin: isProd ? config.http.frontendUrl : '*'}));
app.use(cors({origin: '*'}));
app.use(limiter);
// app.use(!config.http.password || config.http.password == '' ? express.static('build') : reactAuthMiddleware);
app.use(
  // unless(closedBetaMiddleware, '/auth_steam/steam', '/auth_steam/steam/return')
  closedBetaMiddleware
);

global.disableBots = process.argv.includes('--no-bot'); // todo: find a better solution
global.startTime = Math.floor(new Date().getTime() / 1000);

// todo: on start, check if the app was installed (with maybe a lock file or smth)
// if not, display an installation screen (like mybb) where it will ask for database
// credentials, steam api keys etc
if(process.argv.includes('--clear')) {
  process.stdout.write('\033c');
}

console.log('Starting the app...');

const serverCallback = () => {
  console.log(`App listening on port ${process.env.PORT || config.http.port}`);
  console.log(`Mode: ${isProd ? 'production' : 'development'}`);

  require('./services')(app);
  require('./handlers');
  require('./subscribers');

  scheduleBackup();

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, config.http.closedBeta ? (
      req.betaAuth ? 'build' : 'build_closed_beta'
    ) : (
      'build'
    ), 'index.html'))
  });
}

const privateKey = fs.readFileSync( '.ssl/privatekey.pem', 'utf8' );
const certificate = fs.readFileSync( '.ssl/certificate.pem', 'utf8' );

const server = isProd ? (
  https.createServer({
    key: privateKey,
    cert: certificate
  }, app).listen(process.env.PORT || config.http.port, serverCallback)
) : (
  app.listen(process.env.PORT || config.http.port, serverCallback)
);

server.keepAliveTimeout = (60 * 1000) + 1000;
server.headersTimeout = (60 * 1000) + 2000;
app.keepAliveTimeout = (60 * 1000) + 1000;
app.headersTimeout = (60 * 1000) + 2000;


const { io } = require('./classes/IO_Manager')(server);