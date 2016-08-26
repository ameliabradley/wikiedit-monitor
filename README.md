# wikiedit-monitor

[![Build Status](https://travis-ci.org/leebradley/wikiedit-monitor.svg?branch=master)](https://travis-ci.org/leebradley/wikiedit-monitor)

**wikiedit-monitor** logs Wikipedia activity live to a database and performs analysis on that data.

Project goals:
* Obtaining a proper diff of administrative revision deletes
* Detecting edit wars, as they happen
* Finding anomalies in Wikipedia data

This software should be able to run for weeks on end without problems.

## Setup
Prerequisites:
* Docker
* Node.js

1. Copy `(project-root)/conf/docker-config.json` to `(project-root)/config.json`.
2. Start the MongoDB instance by running `npm run-script mongo-docker`.
3. The monitor and web interface by running `npm run-script node-docker-win` (Windows) or `npm run-script node-docker-nix` (Linux and OS X).
4. Access the web interface at `http://localhost:8081`.

Any files you change in the project will sync to the Node Docker instance under `/app`.

Show output from the server processes:
```
docker attach wikiedit-monitor
```

Stop, start, or restart the server:
```
docker stop wikiedit-monitor
docker start wikiedit-monitor
docker restart wikiedit-monitor
```

Remove the docker container: `docker rm wikiedit-monitor`

## Contributing
Make sure your changes succeed the unit tests by running `npm test` from the base directory.
